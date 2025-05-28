// app.js

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0svFL0DvyXVMc3ebkKaEyFwVSl3zWe1ff0qO5NQ1J66AlO8YSwYERGqxsZbDhR1K75g/exec';

let allEventsData = [];
let allChurchesData = [];
let allMinistersData = [];
let allEventParticipantsData = [];
let allGroupsData = []; // For "GuestParticipants" sheet

let calendar;
var eventDetailModalInstance;

// --- State for Active Filters ---
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

    allEventsData.forEach(event => {
        if (!event || !event.EventTitle || !event.StartDate) {
            return;
        }

        let fcStart = event.StartDate;
        let fcEnd = event.EndDate;
        const isAllDay = event.IsAllDay === true || String(event.IsAllDay).toUpperCase() === "TRUE";
        const eventTimeZoneForFC = event.eventActualTimeZone || defaultFallbackTimeZone;

        if (isAllDay) {
            if (fcStart && typeof fcStart === 'string' && fcStart.includes('T')) {
                fcStart = fcStart.substring(0, 10); 
            }
            if (fcEnd && typeof fcEnd === 'string' && fcEnd.includes('T')) {
                fcEnd = fcEnd.substring(0, 10); 
            }
        }
        
        processedEvents.push({
            title: event.EventTitle,
            start: fcStart, 
            end: fcEnd,     
            allDay: isAllDay,
            timeZone: eventTimeZoneForFC, 
            extendedProps: {
                ...event 
            }
        });
    });
    return processedEvents;
}

async function initializeApp() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    try {
        const [
            events, churches, ministers, participants, guestParticipants
        ] = await Promise.all([
            fetchData('Events'),          
            fetchData('Churches'),
            fetchData('Ministers'),
            fetchData('EventParticipants'),
            fetchData('GuestParticipants') 
        ]);

        allEventsData = events || [];
        allChurchesData = churches || [];
        allMinistersData = ministers || [];
        allEventParticipantsData = participants || [];
        allGroupsData = guestParticipants || []; 

        if (allEventsData.length === 0 && allChurchesData.length === 0) {
            console.warn("Initial data fetch returned empty for critical data (Events/Churches).");
        }

        populateFilterDropdowns(); 
        applyFilters(); // This will call processDataForCalendar and renderCalendar

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
        if (Array.isArray(eventsToDisplay)) { 
            calendar.addEventSource(eventsToDisplay);
        } else {
            console.error("renderCalendar: eventsToDisplay is not an array", eventsToDisplay);
            calendar.addEventSource([]); 
        }
    } else {
        console.error("Calendar instance not found for renderCalendar.");
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
}

function handleAddFilter(category, value) { 
    if (!value || value === "") return; 
    const storeValue = value; 
    if (!activeFilters[category].has(storeValue)) {
        activeFilters[category].add(storeValue);
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
        applyFilters();
    }
}

function populateFilterDropdowns() {
    const eventTypeFilterEl = document.getElementById('eventTypeFilter');
    const churchFilterEl = document.getElementById('churchFilter');
    const participantFilterEl = document.getElementById('participantFilter');

    if (!eventTypeFilterEl && !churchFilterEl && !participantFilterEl) {
        console.warn("One or more filter dropdown elements not found in DOM.");
    }

    if(eventTypeFilterEl) eventTypeFilterEl.innerHTML = '<option value="">-- Select Type --</option>';
    if(churchFilterEl) churchFilterEl.innerHTML = '<option value="">-- Select Church --</option>';
    if(participantFilterEl) participantFilterEl.innerHTML = '<option value="">-- Select Participant --</option>';

    if (allEventsData && allEventsData.length > 0) {
        const uniqueEventTypes = new Set();
        allEventsData.forEach(event => { if(event && event.EventType) uniqueEventTypes.add(event.EventType); });
        if(eventTypeFilterEl) {
            [...uniqueEventTypes].filter(Boolean).sort().forEach(type => eventTypeFilterEl.add(new Option(type, type)));
        }
    }

    if (allChurchesData && allChurchesData.length > 0) {
        if(churchFilterEl) {
            allChurchesData.sort((a, b) => ((a?a.ChurchName:"") || "").localeCompare((b?b.ChurchName:"") || "")).forEach(church => {
                if (church && church.ChurchID && church.ChurchName) churchFilterEl.add(new Option(church.ChurchName, church.ChurchID));
            });
        }
    }
    
    if (allEventParticipantsData && allEventParticipantsData.length > 0) {
        const uniqueParticipants = new Set();
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
        if(participantFilterEl) {
            [...uniqueParticipants].filter(Boolean).sort().forEach(name => participantFilterEl.add(new Option(name, name)));
        }
    }

    if(eventTypeFilterEl) {
        eventTypeFilterEl.removeEventListener('change', handleEventTypeFilterChange);
        eventTypeFilterEl.addEventListener('change', handleEventTypeFilterChange);
    }
    if(churchFilterEl) {
        churchFilterEl.removeEventListener('change', handleChurchFilterChange);
        churchFilterEl.addEventListener('change', handleChurchFilterChange);
    }
    if(participantFilterEl) {
        participantFilterEl.removeEventListener('change', handleParticipantFilterChange);
        participantFilterEl.addEventListener('change', handleParticipantFilterChange);
    }
}

function handleEventTypeFilterChange(e) { if(e.target) handleAddFilter('eventType', e.target.value); }
function handleChurchFilterChange(e) { if(e.target) handleAddFilter('church', e.target.value); }
function handleParticipantFilterChange(e) { if(e.target) handleAddFilter('participant', e.target.value); }

function applyFilters() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    setTimeout(() => {
        let baseCalendarEvents = processDataForCalendar(); 
        let filteredForDisplay = baseCalendarEvents;

        if (activeFilters.eventType.size > 0) {
            filteredForDisplay = filteredForDisplay.filter(fcEvent =>
                fcEvent.extendedProps && activeFilters.eventType.has(String(fcEvent.extendedProps.EventType || "").trim())
            );
        }
        if (activeFilters.church.size > 0) {
            filteredForDisplay = filteredForDisplay.filter(fcEvent => 
                fcEvent.extendedProps && activeFilters.church.has(String(fcEvent.extendedProps.ChurchID || "").trim())
            );
        }
        if (activeFilters.participant.size > 0) {
            filteredForDisplay = filteredForDisplay.filter(fcEvent => {
                if (!fcEvent.extendedProps || !fcEvent.extendedProps.EventID) return false;
                const eventID = String(fcEvent.extendedProps.EventID).trim();
                const participantsInThisEvent = allEventParticipantsData.filter(p => p && String(p.EventID).trim() === eventID);
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

        renderCalendar(filteredForDisplay);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }, 10);
}

document.addEventListener('DOMContentLoaded', function() {
    var calendarEl = document.getElementById('calendar');
    if (!calendarEl) { console.error("Calendar #calendar not found!"); return; }
    if (typeof FullCalendar === 'undefined') { console.error("FullCalendar library not loaded!"); return; }
    
    // Optional: Check for date-fns for modal if you decide to use them later
    // if (typeof dateFns === 'undefined' || typeof dateFnsTz === 'undefined') {
    //     console.warn("date-fns or date-fns-tz library not loaded. Modal date/time formatting will use basic toLocaleString().");
    // }

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
            left: 'prev,next today',
            center: 'title',
            right: 'listDay,listWeek,listMonth,listYear,dayGridMonth' // Matched view names
        },
        timeZone: 'local', 
        events: [], 
        weekends: true,
        loading: function(isLoading) {
            const loadingEl = document.getElementById('loading-indicator');
            if (loadingEl) {
                // This hook is mainly for FC's internal loading (e.g. view changes)
                // Our manual indicator in initializeApp/applyFilters handles data fetch loading.
                // To avoid conflicts, only let FC control it if not already shown by our functions.
                // if (isLoading && loadingEl.style.display === 'none') loadingEl.style.display = 'block';
                // else if (!isLoading) loadingEl.style.display = 'none';
            }
        },
        eventDidMount: function(info) {
            // console.log(
            //     "FC EVENT MOUNTED:", "Title:", info.event.title,
            //     "startStr:", info.event.startStr,
            //     "event.timeZone:", info.event.timeZone,
            //     "calculated start (local browser):", info.event.start ? info.event.start.toString() : 'N/A',
            //     "allDay:", info.event.allDay
            // );
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

            if (info.event.start) {
                let startDisplayStr = '';
                try {
                    const eventDateObj = info.event.start; 
                    const datePartModal = eventDateObj.toLocaleDateString('en-US', {
                        timeZone: displayTimeZone,
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });
                    let timePartModal = "";
                    if (!info.event.allDay && props.StartTime) { 
                        timePartModal = props.StartTime; 
                    } else if (!info.event.allDay) { 
                         timePartModal = eventDateObj.toLocaleTimeString('en-US', {
                            timeZone: displayTimeZone,
                            hour: 'numeric', minute: 'numeric', timeZoneName: 'short'
                        });
                    }
                    startDisplayStr = `${datePartModal}${timePartModal ? ' at ' + timePartModal : ''} (${displayTimeZone.replace(/_/g," ")})`;
                } catch (e) {
                    console.error("Error formatting start date for modal:", e);
                    startDisplayStr = info.event.start.toLocaleString();
                }
                detailsHtml += `<p><strong>When:</strong> ${startDisplayStr}</p>`;
                const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (displayTimeZone !== browserTimeZone && displayTimeZone !== 'UTC' && !info.event.allDay) {
                    detailsHtml += `<p><small>(Your local time: ${info.event.start.toLocaleString()})</small></p>`;
                }
            } else {
                 detailsHtml += `<p><strong>Date:</strong> N/A</p>`;
            }

            if (info.event.end && !info.event.allDay && props.EndTime) { 
                 let endDisplayStr = props.EndTime + ` (${displayTimeZone.replace(/_/g," ")})`;
                 detailsHtml += `<p><strong>End:</strong> ${endDisplayStr}</p>`;
            }

            detailsHtml += `<p><strong>Type:</strong> ${props.EventType || 'N/A'}</p>`;
            detailsHtml += `<p><strong>Description:</strong> ${props.Description || 'None'}</p>`;

            const church = allChurchesData.find(c => c && String(c.ChurchID).trim() === String(props.ChurchID).trim());
            if (church) {
                detailsHtml += `<p><strong>Church:</strong> ${church.ChurchName || 'N/A'}</p>`;
                detailsHtml += `<p><strong>Location:</strong> ${props.LocationOverride || church.Address || 'N/A'}</p>`;
            }

            const participantsForEvent = allEventParticipantsData.filter(p => p && String(p.EventID).trim() === String(props.EventID).trim());
            if (participantsForEvent.length > 0) {
                detailsHtml += `<p><strong>Featuring:</strong></p><ul>`;
                participantsForEvent.forEach(participant => {
                    if(!participant) return;
                    let name = null;
                    let role = participant.RoleInEvent ? String(participant.RoleInEvent).trim() : '';
                    let participantChurchName = null; 
                    if (participant.MinisterID) { 
                        const ministerIDToFind = String(participant.MinisterID).trim();
                        const minister = allMinistersData.find(m => m && String(m.MinisterID).trim() === ministerIDToFind);
                        if (minister) {
                            name = minister.Name ? String(minister.Name).trim() : 'Unknown Minister';
                            participantChurchName = minister.ChurchName ? String(minister.ChurchName).trim() : null;
                        } else { name = 'Minister ID Not Found'; }
                    } else if (participant.GroupID && typeof allGroupsData !== 'undefined' && allGroupsData && allGroupsData.length > 0) { 
                        const groupIDToFind = String(participant.GroupID).trim();
                        const group = allGroupsData.find(g => g && String(g.GroupID).trim() === groupIDToFind);
                        if (group) {
                            name = group.GroupName ? String(group.GroupName).trim() : 'Unknown Group';
                            if (group.AssociatedChurchID && allChurchesData) {
                                const associatedChurch = allChurchesData.find(c => c && String(c.ChurchID).trim() === String(group.AssociatedChurchID).trim());
                                if (associatedChurch) participantChurchName = associatedChurch.ChurchName ? String(associatedChurch.ChurchName).trim() : null;
                            }
                        } else { name = 'Group ID Not Found'; }
                    } else if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() !== "") { 
                        name = String(participant.ParticipantNameOverride).trim();
                    }
                    detailsHtml += `<li>${name || 'N/A'} ${participantChurchName ? `[${participantChurchName}]` : ''} ${role ? `(${role})` : ''}</li>`;
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
