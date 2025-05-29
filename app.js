// app.js

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0svFL0DvyXVMc3ebkKaEyFwVSl3zWe1ff0qO5NQ1J66AlO8YSwYERGqxsZbDhR1K75g/exec';

let allEventsData = [];
let allChurchesData = [];
let allMinistersData = [];
let allEventParticipantsData = [];
let allGroupsData = []; 
let allServiceSchedulePatterns = []; 

let calendar;
var eventDetailModalInstance;
var filterCollapseInstance; 

let activeFilters = {
    eventType: new Set(),
    church: new Set(),
    participant: new Set()
};

async function fetchData(sheetName) {
    try {
        const response = await fetch(`${SCRIPT_URL}?sheet=${sheetName}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for sheet ${sheetName}`);
        const result = await response.json();
        if (result.error) {
            console.error(`API error for sheet ${sheetName}:`, result.error, result);
            throw new Error(`API error for sheet ${sheetName}: ${result.error}`);
        }
        return result.data || [];
    } catch (error) {
        console.error(`Error fetching ${sheetName}:`, error);
        return [];
    }
}

function processDataForCalendar() {
    let processedEvents = [];
    const defaultFallbackTimeZone = 'America/Chicago';
    const expandSeriesCheckbox = document.getElementById('expandSeriesFilter');
    const showExpandedSeries = expandSeriesCheckbox ? expandSeriesCheckbox.checked : false; 

    allEventsData.forEach(event => {
        if (!event || !event.EventTitle || !event.StartDate) {
            return;
        }

        const isSeriesParent = event.IsSeriesParent === true || String(event.IsSeriesParent).toUpperCase() === "TRUE";
        const isGeneratedInstance = event.isGeneratedInstance === true; 

        if (isSeriesParent) {
            if (!showExpandedSeries) {
                let parentEventForCalendar = {
                    title: `${event.EventTitle} (${event.EventType} Series)`, 
                    start: event.StartDate, 
                    end: event.StartDate, 
                    allDay: true, 
                    timeZone: event.eventActualTimeZone || defaultFallbackTimeZone,
                    extendedProps: { ...event, isPlaceholder: true } 
                };
                processedEvents.push(parentEventForCalendar);
            }
        } else if (isGeneratedInstance) {
            if (showExpandedSeries) {
                let fcStart = event.StartDate;
                let fcEnd = event.EndDate;
                const isAllDay = event.IsAllDay === true || String(event.IsAllDay).toUpperCase() === "TRUE";
                const eventTimeZoneForFC = event.eventActualTimeZone || defaultFallbackTimeZone;

                if (isAllDay) { 
                    if (fcStart && typeof fcStart === 'string' && fcStart.includes('T')) fcStart = fcStart.substring(0, 10);
                    if (fcEnd && typeof fcEnd === 'string' && fcEnd.includes('T')) fcEnd = fcEnd.substring(0, 10);
                }
                
                processedEvents.push({
                    title: event.EventTitle, 
                    start: fcStart,
                    end: fcEnd,
                    allDay: isAllDay,
                    timeZone: eventTimeZoneForFC,
                    extendedProps: { ...event }
                });
            }
        } else {
            let fcStart = event.StartDate;
            let fcEnd = event.EndDate;
            const isAllDay = event.IsAllDay === true || String(event.IsAllDay).toUpperCase() === "TRUE";
            const eventTimeZoneForFC = event.eventActualTimeZone || defaultFallbackTimeZone;

            if (isAllDay) {
                if (fcStart && typeof fcStart === 'string' && fcStart.includes('T')) fcStart = fcStart.substring(0, 10);
                if (fcEnd && typeof fcEnd === 'string' && fcEnd.includes('T')) fcEnd = fcEnd.substring(0, 10);
            }
            
            processedEvents.push({
                title: event.EventTitle,
                start: fcStart,
                end: fcEnd,
                allDay: isAllDay,
                timeZone: eventTimeZoneForFC,
                extendedProps: { ...event }
            });
        }
    });
    return processedEvents;
}

async function initializeApp() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    try {
        const [events, churches, ministers, participants, guestParticipants, servicePatterns] = await Promise.all([
            fetchData('Events'),
            fetchData('Churches'),
            fetchData('Ministers'),
            fetchData('EventParticipants'),
            fetchData('GuestParticipants'), 
            fetchData('ServiceSchedulePatterns') 
        ]);

        allEventsData = events || [];
        allChurchesData = churches || [];
        allMinistersData = ministers || [];
        allEventParticipantsData = participants || [];
        allGroupsData = guestParticipants || []; 
        allServiceSchedulePatterns = servicePatterns || []; 

        if (allEventsData.length === 0 && allChurchesData.length === 0) {
            console.warn("Initial data fetch returned empty for critical data (Events/Churches).");
        }

        populateFilterDropdowns();
        applyFilters(); 

    } catch (error) {
        console.error("Error during application initialization:", error);
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.textContent = 'Failed to load calendar data. Please try refreshing.';
            errorContainer.style.display = 'block';
        }
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}

function renderCalendar(eventsToDisplay) {
    if (calendar) {
        calendar.removeAllEvents();
        if (Array.isArray(eventsToDisplay)) calendar.addEventSource(eventsToDisplay);
        else { console.error("renderCalendar: eventsToDisplay not an array"); calendar.addEventSource([]); }
    } else { console.error("Calendar instance not found for renderCalendar."); }
}

function showFilterCollapse() {
    if (filterCollapseInstance) {
        filterCollapseInstance.show();
    } else if (document.getElementById('filterCollapse') && typeof bootstrap !== 'undefined') {
        filterCollapseInstance = new bootstrap.Collapse(document.getElementById('filterCollapse'), {
            toggle: false 
        });
        filterCollapseInstance.show();
    }
}

function renderActiveFilterTags() {
    const container = document.getElementById('activeFiltersContainer');
    if (!container) return;
    container.innerHTML = ''; 
    let hasActiveFilters = false;

    Object.keys(activeFilters).forEach(category => {
        activeFilters[category].forEach(value => {
            hasActiveFilters = true;
            let displayValue = value;
            let categoryLabel = "";

            if (category === 'church' && allChurchesData) {
                const church = allChurchesData.find(c => c && String(c.ChurchID) === String(value));
                if (church) displayValue = church.ChurchName || value;
                categoryLabel = "Church";
            } else if (category === 'eventType') {
                categoryLabel = "Type";
            } else if (category === 'participant') {
                categoryLabel = "Participant"; 
            }

            const tag = document.createElement('span');
            tag.className = 'filter-tag';
            tag.setAttribute('data-filter-category', category);
            tag.setAttribute('data-filter-value', value); 
            tag.innerHTML = `${categoryLabel}: ${displayValue} <button type="button" class="btn-close-custom" aria-label="Remove filter">&times;</button>`;
            tag.querySelector('.btn-close-custom').addEventListener('click', function() {
                handleRemoveFilter(category, value);
            });
            container.appendChild(tag);
        });
    });
    container.style.display = hasActiveFilters ? 'block' : 'none';
    if (hasActiveFilters) { 
        showFilterCollapse();
    }
}

function updateParticipantOptions() {
    const participantFilterEl = document.getElementById('participantFilter');
    if (!participantFilterEl) return;

    const previouslyActiveParticipantFilters = new Set(activeFilters.participant); 
    participantFilterEl.innerHTML = '<option value="">-- Select Participant --</option>';
    
    const uniqueParticipants = new Set();
    const activeEventTypeFilters = [...activeFilters.eventType];
    let filterMode = "all";

    if (activeEventTypeFilters.length > 0) { 
        if (activeEventTypeFilters.some(type => type.toLowerCase() === "singing")) {
            filterMode = "singing";
        } else if (activeEventTypeFilters.some(type => type.toLowerCase() === "revival" || type.toLowerCase() === "revival meeting")) {
            filterMode = "revival";
        }
    }
    
    if (filterMode === "singing") {
        if (allGroupsData && allGroupsData.length > 0) {
            allGroupsData.forEach(group => {
                if (group && group.GroupName) uniqueParticipants.add(String(group.GroupName).trim());
            });
        }
        allEventParticipantsData.forEach(p => { 
            if (p && p.ParticipantNameOverride && !p.MinisterID && !p.GroupID) {
                 uniqueParticipants.add(String(p.ParticipantNameOverride).trim());
            }
        });
    } else if (filterMode === "revival") {
        if (allMinistersData && allMinistersData.length > 0) {
            allMinistersData.forEach(minister => {
                if (minister && minister.Name) uniqueParticipants.add(String(minister.Name).trim());
            });
        }
    } else { 
        if (allEventParticipantsData && allEventParticipantsData.length > 0) {
            allEventParticipantsData.forEach(participant => {
                if(!participant) return;
                if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() !== "") {
                    uniqueParticipants.add(String(participant.ParticipantNameOverride).trim());
                } else if (participant.MinisterID && allMinistersData) {
                    const minister = allMinistersData.find(m => m && String(m.MinisterID).trim() === String(participant.MinisterID).trim());
                    if (minister && minister.Name && String(minister.Name).trim() !== "") uniqueParticipants.add(String(minister.Name).trim());
                } else if (participant.GroupID && allGroupsData && allGroupsData.length > 0) { 
                    const group = allGroupsData.find(g => g && String(g.GroupID).trim() === String(participant.GroupID).trim());
                    if (group && group.GroupName && String(group.GroupName).trim() !== "") uniqueParticipants.add(String(group.GroupName).trim());
                }
            });
        }
    }
    
    [...uniqueParticipants].filter(Boolean).sort().forEach(name => participantFilterEl.add(new Option(name, name)));
    
    let participantFilterChanged = false;
    previouslyActiveParticipantFilters.forEach(activeP => {
        if (!uniqueParticipants.has(activeP)) {
            activeFilters.participant.delete(activeP);
            participantFilterChanged = true;
        }
    });

    if (participantFilterChanged) {
        renderActiveFilterTags(); 
    }
}


function populateFilterDropdowns() {
    const eventTypeFilterEl = document.getElementById('eventTypeFilter');
    const churchFilterEl = document.getElementById('churchFilter');
    const participantFilterEl = document.getElementById('participantFilter'); 
    const expandSeriesFilterEl = document.getElementById('expandSeriesFilter'); 

    if (eventTypeFilterEl) {
        eventTypeFilterEl.innerHTML = '<option value="">-- Select Type --</option>';
        if (allEventsData && allEventsData.length > 0) {
            const uniqueEventTypes = new Set();
            allEventsData.forEach(event => { if(event && event.EventType) uniqueEventTypes.add(event.EventType); });
            [...uniqueEventTypes].filter(Boolean).sort().forEach(type => eventTypeFilterEl.add(new Option(type, type)));
        }
        eventTypeFilterEl.removeEventListener('change', handleEventTypeFilterChange);
        eventTypeFilterEl.addEventListener('change', handleEventTypeFilterChange);
    }

    if (churchFilterEl) {
        churchFilterEl.innerHTML = '<option value="">-- Select Church --</option>';
        if (allChurchesData && allChurchesData.length > 0) {
            allChurchesData.sort((a, b) => ((a?a.ChurchName:"") || "").localeCompare((b?b.ChurchName:"") || "")).forEach(church => {
                if (church && church.ChurchID && church.ChurchName) churchFilterEl.add(new Option(church.ChurchName, church.ChurchID));
            });
        }
        churchFilterEl.removeEventListener('change', handleChurchFilterChange);
        churchFilterEl.addEventListener('change', handleChurchFilterChange);
    }
    
    updateParticipantOptions(); 
    if (participantFilterEl) {
        participantFilterEl.removeEventListener('change', handleParticipantFilterChange);
        participantFilterEl.addEventListener('change', handleParticipantFilterChange);
    }

    if (expandSeriesFilterEl) {
        expandSeriesFilterEl.removeEventListener('change', applyFilters); 
        expandSeriesFilterEl.addEventListener('change', applyFilters);
    }
}

function handleAddFilter(category, value) { 
    if (!value || value === "") { 
        const filterDropdown = document.getElementById(category + 'Filter');
        if (filterDropdown) filterDropdown.selectedIndex = 0; 
        return; 
    }
    const storeValue = value; 
    let changed = false;
    if (activeFilters[category].has(storeValue)) {
        const filterDropdown = document.getElementById(category + 'Filter');
        if (filterDropdown) filterDropdown.selectedIndex = 0;
        return; 
    }
    activeFilters[category].add(storeValue);
    changed = true;
    if (changed) {
        if (category === 'eventType') {
            updateParticipantOptions(); 
        }
        renderActiveFilterTags();
        applyFilters();
    }
    const filterDropdown = document.getElementById(category + 'Filter');
    if (filterDropdown) filterDropdown.selectedIndex = 0;
}

function handleRemoveFilter(category, value) {
    if (activeFilters[category] && activeFilters[category].has(value)) { 
        activeFilters[category].delete(value);
        renderActiveFilterTags(); 
        if (category === 'eventType') {
            updateParticipantOptions(); 
        }
        applyFilters();
    }
}

function handleEventTypeFilterChange(e) { if(e.target) handleAddFilter('eventType', e.target.value); }
function handleChurchFilterChange(e) { if(e.target) handleAddFilter('church', e.target.value); }
function handleParticipantFilterChange(e) { if(e.target) handleAddFilter('participant', e.target.value); }

function applyFilters() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    setTimeout(() => {
        let eventsToDisplay = processDataForCalendar(); 
        if (activeFilters.eventType.size > 0) {
            eventsToDisplay = eventsToDisplay.filter(fcEvent =>
                fcEvent.extendedProps && [...activeFilters.eventType].some(typeFilter => 
                    String(fcEvent.extendedProps.EventType || "").trim() === typeFilter
                )
            );
        }
        if (activeFilters.church.size > 0) {
            eventsToDisplay = eventsToDisplay.filter(fcEvent => 
                fcEvent.extendedProps && [...activeFilters.church].some(churchFilter =>
                    String(fcEvent.extendedProps.ChurchID || "").trim() === churchFilter
                )
            );
        }
        if (activeFilters.participant.size > 0) {
            eventsToDisplay = eventsToDisplay.filter(fcEvent => {
                if (!fcEvent.extendedProps || !fcEvent.extendedProps.EventID) return false;
                const originalEventID = String(fcEvent.extendedProps.EventID).trim(); 
                const participantsInThisEvent = allEventParticipantsData.filter(p => p && String(p.EventID).trim() === originalEventID);
                if (participantsInThisEvent.length === 0) return false;
                return participantsInThisEvent.some(participant => {
                    if(!participant) return false;
                    let nameToCheck = null;
                    if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() !== "") {
                        nameToCheck = String(participant.ParticipantNameOverride).trim();
                    } else if (participant.MinisterID && allMinistersData) {
                        const minister = allMinistersData.find(m => m && String(m.MinisterID).trim() === String(participant.MinisterID).trim());
                        if (minister && minister.Name) nameToCheck = String(minister.Name).trim();
                    } else if (participant.GroupID && allGroupsData && allGroupsData.length > 0) {
                        const group = allGroupsData.find(g => g && String(g.GroupID).trim() === String(participant.GroupID).trim());
                        if (group && group.GroupName) nameToCheck = String(group.GroupName).trim();
                    }
                    return nameToCheck && activeFilters.participant.has(nameToCheck);
                });
            });
        }
        renderCalendar(eventsToDisplay);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }, 10);
}

document.addEventListener('DOMContentLoaded', function() {
    var calendarEl = document.getElementById('calendar');
    if (!calendarEl) { console.error("Calendar #calendar not found!"); return; }
    if (typeof FullCalendar === 'undefined') { console.error("FullCalendar library not loaded!"); return; }
    
    const filterCollapseElement = document.getElementById('filterCollapse');
    if (filterCollapseElement && typeof bootstrap !== 'undefined') {
        filterCollapseInstance = new bootstrap.Collapse(filterCollapseElement, { toggle: false });
    } else if (!filterCollapseElement) { console.warn("#filterCollapse element not found.") }

    if (typeof bootstrap !== 'undefined' && document.getElementById('eventDetailModal')) {
        try { eventDetailModalInstance = new bootstrap.Modal(document.getElementById('eventDetailModal')); }
        catch (e) { console.error("Error initializing Bootstrap modal:", e); }
    } else { console.warn("Bootstrap or #eventDetailModal not found."); }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'listWeek', 
        views: { 
            listDay: { buttonText: 'D' },
            listWeek: { buttonText: 'W' },
            listMonth: { buttonText: 'M' },
            listYear: { buttonText: 'Y' },
            dayGridMonth: { buttonText: 'Grid' } // Changed from listMonth for standard month view   
        },
        headerToolbar: {
            left: 'prev,next today', center: 'title',
            right: 'listDay,listWeek,listMonth,listYear,dayGridMonth' // Matched view names
        },
        timeZone: 'local', 
        events: [], 
        weekends: true,
        loading: function(isLoading) {
            const loadingEl = document.getElementById('loading-indicator');
            if (loadingEl) loadingEl.style.display = isLoading ? 'block' : 'none';
        },
        datesSet: function(viewInfo) { // Use datesSet or viewDidMount
            const expandSeriesCheckbox = document.getElementById('expandSeriesFilter');
            if (expandSeriesCheckbox && viewInfo.view.type === 'listDay') {
                if (!expandSeriesCheckbox.checked) { // Only if not already checked
                    expandSeriesCheckbox.checked = true;
                    applyFilters(); // Re-apply filters to show expanded series
                }
            }
            //  Optional: If you want to uncheck it when leaving listDay:
             else if (expandSeriesCheckbox && expandSeriesCheckbox.checked && viewInfo.view.type === 'listDay') {
                 expandSeriesCheckbox.checked = false;
                 applyFilters();
             }
        },
        eventClick: function(info) {
            if (!eventDetailModalInstance) {
                alert(`Event: ${info.event.title}\nStart: ${info.event.start ? info.event.start.toLocaleString() : 'N/A'}`);
                return;
            }

            const props = info.event.extendedProps || {};
            const eventTitle = info.event.title || "Event Details";
            let detailsHtml = `<h4>${eventTitle}</h4>`;
            
            const displayTimeZone = props.eventActualTimeZone || 'UTC'; 
            let timeZoneAbbreviation = ''; // To store CDT, EDT, etc.

            if (info.event.start) {
                let startDisplayStr = '';
                try {
                    const eventDateObj = info.event.start; 
                    const datePartModal = eventDateObj.toLocaleDateString('en-US', { timeZone: displayTimeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    let timePartModal = "";
                    if (!info.event.allDay) { 
                         // Get time with abbreviation
                         const timeWithAbbr = eventDateObj.toLocaleTimeString('en-US', { timeZone: displayTimeZone, hour: 'numeric', minute: 'numeric', timeZoneName: 'short'});
                         timePartModal = timeWithAbbr;
                         // Extract abbreviation if needed elsewhere, though it's part of timeWithAbbr
                         const parts = timeWithAbbr.split(' ');
                         if (parts.length > 2) timeZoneAbbreviation = parts.pop(); // Get last part like CDT/EDT
                    }
                    startDisplayStr = `${datePartModal}${timePartModal ? ' at ' + timePartModal : ''}`;
                } catch (e) {
                    console.error("Error formatting start date for modal:", e);
                    startDisplayStr = info.event.start.toLocaleString(); 
                }
                detailsHtml += `<p><strong>When:</strong> ${startDisplayStr}</p>`;
                const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (displayTimeZone !== browserTimeZone && displayTimeZone !== 'UTC' && !info.event.allDay) {
                    detailsHtml += `<p><small>(Your local time: ${info.event.start.toLocaleString()})</small></p>`;
                }
            } else { detailsHtml += `<p><strong>Date:</strong> N/A</p>`; }

            if (info.event.end && !info.event.allDay) { 
                 let endDisplayStr = '';
                 try {
                    const eventEndDateObj = info.event.end;
                    endDisplayStr = eventEndDateObj.toLocaleTimeString('en-US', { timeZone: displayTimeZone, hour: 'numeric', minute: 'numeric', timeZoneName: 'short'});
                 } catch (e) {
                    console.error("Error formatting end date for modal:", e);
                    endDisplayStr = info.event.end.toLocaleTimeString();
                 }
                 detailsHtml += `<p><strong>End:</strong> ${endDisplayStr}</p>`;
            }
            
            detailsHtml += `<p><strong>Type:</strong> ${props.EventType || 'N/A'}</p>`;

            // --- SCHEDULE (from patterns) / DESCRIPTION DISPLAY ---
            const originalEventID = props.EventID; 
            const patternsForThisEvent = allServiceSchedulePatterns.filter(p => p && String(p.ParentEventID).trim() === String(originalEventID).trim());

            if (patternsForThisEvent.length > 0) {
                detailsHtml += `<p><strong>Schedule (${timeZoneAbbreviation || displayTimeZone.replace(/_/g," ")}):</strong></p>`; // Add TZ info to schedule header
                const patternsByDay = {};
                patternsForThisEvent.forEach(p => {
                    if(!p.DayOfWeek) return;
                    if(!patternsByDay[p.DayOfWeek]) patternsByDay[p.DayOfWeek] = [];
                    patternsByDay[p.DayOfWeek].push(p);
                });

                const dayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Weekdays"];
                let scheduleContent = "";
                dayOrder.forEach(dayKey => {
                    if (patternsByDay[dayKey] && patternsByDay[dayKey].length > 0) {
                        scheduleContent += `<ul><li><strong>${dayKey}:</strong></li><ul>`;
                        patternsByDay[dayKey].sort((a,b) => { 
                            const timeA = (a.ServiceStartTime || "").toUpperCase().includes("PM") ? 1200 + parseInt((a.ServiceStartTime || "0:0").replace(/\D/g,'')) : parseInt((a.ServiceStartTime || "0:0").replace(/\D/g,''));
                            if ((a.ServiceStartTime || "").toUpperCase().includes("AM") && (a.ServiceStartTime || "").startsWith("12")) timeA -= 1200;
                            const timeB = (b.ServiceStartTime || "").toUpperCase().includes("PM") ? 1200 + parseInt((b.ServiceStartTime || "0:0").replace(/\D/g,'')) : parseInt((b.ServiceStartTime || "0:0").replace(/\D/g,''));
                            if ((b.ServiceStartTime || "").toUpperCase().includes("AM") && (b.ServiceStartTime || "").startsWith("12")) timeB -= 1200;
                            return timeA - timeB;
                        }).forEach(p => {
                            // Append abbreviation to pattern times if available
                            let patternTimeDisplay = p.ServiceStartTime || '';
                            if (p.ServiceEndTime) patternTimeDisplay += ` - ${p.ServiceEndTime}`;
                            scheduleContent += `<li>${patternTimeDisplay || 'N/A'}: ${p.ServiceSubTitle || p.EventType || 'Service'}</li>`;
                        });
                        scheduleContent += `</ul></ul>`;
                    }
                });
                 if (scheduleContent === "") scheduleContent = "<p><em>No detailed schedule patterns found for this event's ID.</em></p>";
                detailsHtml += scheduleContent;
            }
            
            let descriptionText = props.Description || 'None';
            if (typeof descriptionText === 'string') {
                descriptionText = descriptionText.replace(/\n/g, '<br>');
            }
            if (patternsForThisEvent.length > 0 && props.Description && props.Description.trim() !== "") {
                 detailsHtml += `<h6 class="mt-3">Additional Details:</h6><p>${descriptionText}</p>`;
            } else if (descriptionText !== 'None' && descriptionText.trim() !== "") {
                 detailsHtml += `<p><strong>Description:</strong><br>${descriptionText}</p>`;
            } else if (patternsForThisEvent.length === 0) { 
                 detailsHtml += `<p><strong>Description:</strong> None</p>`;
            }
            // --- END SCHEDULE / DESCRIPTION DISPLAY ---

            const church = allChurchesData.find(c => c && String(c.ChurchID).trim() === String(props.ChurchID).trim());
            if (church) { 
                detailsHtml += `<p><strong>Church:</strong> ${church.ChurchName||'N/A'}</p>`;
                detailsHtml += `<p><strong>Location:</strong> ${props.LocationOverride||church.Address||'N/A'}</p>`;
            }

            const participantsForEvent = allEventParticipantsData.filter(p => p && String(p.EventID).trim() === String(props.EventID).trim());
            if (participantsForEvent.length > 0) {
                detailsHtml += `<p><strong>Featuring:</strong></p><ul>`;
                participantsForEvent.forEach(participant => {
                    if(!participant) return; 
                    let name = null; 
                    let role = participant.RoleInEvent ? String(participant.RoleInEvent).trim() : ''; 
                    let pChurchName = null; 
                    let groupMembersHtml = '';

                    if (participant.MinisterID) { 
                        const minister = allMinistersData.find(m => m && String(m.MinisterID).trim() === String(participant.MinisterID).trim());
                        if (minister) { 
                            name = minister.Name ? String(minister.Name).trim() : 'M. Name?'; 
                            pChurchName = minister.ChurchName ? String(minister.ChurchName).trim() : null;
                        } else { name = 'M. ID?'; }
                    } else if (participant.GroupID && allGroupsData && allGroupsData.length > 0) { 
                        const group = allGroupsData.find(g => g && String(g.GroupID).trim() === String(participant.GroupID).trim());
                        if (group) { 
                            name = group.GroupName ? String(group.GroupName).trim() : 'G. Name?'; 
                            if (group.AssociatedChurchID && allChurchesData) { 
                                const c = allChurchesData.find(ch => ch && String(ch.ChurchID).trim() === String(group.AssociatedChurchID).trim()); 
                                if (c) pChurchName = c.ChurchName ? String(c.ChurchName).trim() : null;
                            }
                            if (allGroupMembersData && allGroupMembersData.length > 0) {
                                const members = allGroupMembersData.filter(gm => gm && String(gm.GroupID).trim() === String(participant.GroupID).trim());
                                if (members.length > 0) {
                                    groupMembersHtml = '<br/><small>Members:<ul>';
                                    members.forEach(member => {
                                        groupMembersHtml += `<li><small>${member.MemberName || 'Unknown Member'}</small></li>`;
                                    });
                                    groupMembersHtml += '</ul></small>';
                                }
                            }
                        } else { name = 'G. ID?'; }
                    } else if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() !== "") { 
                        name = String(participant.ParticipantNameOverride).trim(); 
                    }
                    detailsHtml += `<li>${name||'N/A'} ${pChurchName?`[${pChurchName}]`:''} ${role?`(${role})`:''} ${groupMembersHtml}</li>`;
                });
                detailsHtml += `</ul>`;
            }
            document.getElementById('eventDetailBody').innerHTML = detailsHtml;
            if(eventDetailModalInstance) eventDetailModalInstance.show();
        }
    });
    calendar.render();
    initializeApp();
});
