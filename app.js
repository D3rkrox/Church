// app.js

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0svFL0DvyXVMc3ebkKaEyFwVSl3zWe1ff0qO5NQ1J66AlO8YSwYERGqxsZbDhR1K75g/exec';

let allEventsData = [];
let allChurchesData = [];
let allMinistersData = [];
let allEventParticipantsData = [];
let allGroupsData = []; 
let allGroupMembersData = [];
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
        const response = await fetch(`${SCRIPT_URL}?action=getSheetData&sheet=${sheetName}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for sheet ${sheetName}`);
        const result = await response.json();
        if (result.error) {
            console.error(`API error for sheet ${sheetName}:`, result.error, result);
            throw new Error(`API error for sheet ${sheetName}: ${result.error}`);
        }
        return result.data || [];
    } catch (error) {
        console.error(`Error fetching ${sheetName}:`, error);
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.textContent = `Failed to load data for: ${sheetName}. Please refresh. Error: ${error.message}`;
            errorContainer.style.display = 'block';
        }
        return [];
    }
}

function processDataForCalendar() {
    let processedEvents = [];
    const expandSeriesCheckbox = document.getElementById('expandSeriesFilter');
    const showExpandedSeries = expandSeriesCheckbox ? expandSeriesCheckbox.checked : false;

    allEventsData.forEach((event, index) => {
        if (!event || !event.EventTitle || !event.StartDate) {
            return;
        }

        const eventSourceType = String(event.sourceType || '').trim();

        let fcEventData = {
            title: event.EventTitle,
            start: event.StartDate,
            //end: event.EndDate,
            allDay: String(event.IsAllDay).toLowerCase() === "true",
            timeZone: event.eventActualTimeZone || 'America/Chicago',
            extendedProps: { ...event } 
        };

        if (fcEventData.allDay) {
            if (fcEventData.start && typeof fcEventData.start === 'string' && fcEventData.start.includes('T')) {
                fcEventData.start = fcEventData.start.substring(0, 10);
            }
            if (fcEventData.end && typeof fcEventData.end === 'string' && fcEventData.end.includes('T')) {
                fcEventData.end = fcEventData.end.substring(0, 10);
            }
        }

        if (eventSourceType.startsWith('special-event-series-parent')) {
            // console.log("Processing potential series parent:", event.EventTitle, "ShowExpanded:", showExpandedSeries); 
            if (!showExpandedSeries) {
                // console.log(">>> Adding parent placeholder as REGULAR ALL-DAY EVENT for:", event.EventTitle); 

                // --- TEMPORARY CHANGE: Make it a normal all-day event ---
                fcEventData.allDay = true; 
                // fcEventData.display = 'background'; // Comment out background display
                // fcEventData.backgroundColor = '#FFC107'; // Comment out background color
                fcEventData.title = `${event.EventTitle} (${event.EventType} Series)`; // Keep a distinct title
                fcEventData.extendedProps.isPlaceholder = true; // Still mark it

                // Ensure start and end are YYYY-MM-DD for allDay events
                // The global allDay formatting block later will handle the substring(0,10)
                // We just need to ensure fcEventData.start and fcEventData.end are correct
                // For a multi-day all-day event, 'end' is exclusive.
                // StartDate: "2025-06-08T05:00:00.000Z" -> '2025-06-08'
                // EndDate:   "2025-06-14T04:59:00.000Z" -> means it includes up to end of 13th. Exclusive end should be '2025-06-14'
                // The fcEventData already has these UTC strings. The allDay formatting block handles the conversion.

                processedEvents.push(fcEventData);
            }
        }  else if (eventSourceType.startsWith('special-event-series-instance')) {
            if (showExpandedSeries) {
                processedEvents.push(fcEventData);
            }
        } else if (eventSourceType.startsWith('regular-')) {
            processedEvents.push(fcEventData);
        } else if (eventSourceType.startsWith('special-event-single')) {
            processedEvents.push(fcEventData);
        } else { 
            // Fallback for events from "Events" sheet that might not have sourceType yet in an old cache
            // OR if sourceType was ""
            if (String(event.IsSeriesParent).toLowerCase() !== "true" && String(event.isGeneratedInstance).toLowerCase() !== "true") {
                processedEvents.push(fcEventData);
            }
        }
    });
    return processedEvents;
}

async function initializeApp() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    try {
        const [events, churches, ministers, participants, guestParticipants, servicePatterns, groupMembers] = await Promise.all([
            fetchData('Events'),
            fetchData('Churches'),
            fetchData('Ministers'),
            fetchData('EventParticipants'),
            fetchData('GuestParticipants'), 
            fetchData('ServiceSchedulePatterns') ,
            fetchData('GroupMembers') // <-- ADD THIS LINE
        ]);

        allEventsData = events || [];
        allChurchesData = churches || [];
        allMinistersData = ministers || [];
        allEventParticipantsData = participants || [];
        allGroupsData = guestParticipants || []; 
        allServiceSchedulePatterns = servicePatterns || []; 
        allGroupMembersData = groupMembers || []; // <-- ADD THIS LINE
/*
        console.log("Fetched allEventsData count in initializeApp:", allEventsData.length);
        if (allEventsData.length > 0) {
            //console.log("Sample event data item 0 from allEventsData:", JSON.stringify(allEventsData[0]));
            const seriesParentExample = allEventsData.find(ev => String(ev.IsSeriesParent).toLowerCase() === "true");
            if(seriesParentExample) console.log("Sample series parent from allEventsData:", JSON.stringify(seriesParentExample));
            const generatedInstanceExample = allEventsData.find(ev => String(ev.isGeneratedInstance).toLowerCase() === "true");
            if(generatedInstanceExample) console.log("Sample generated instance from allEventsData:", JSON.stringify(generatedInstanceExample));
            const singleEventExample = allEventsData.find(ev => String(ev.IsSeriesParent).toLowerCase() !== "true" && String(ev.isGeneratedInstance).toLowerCase() !== "true");
            if(singleEventExample) console.log("Sample single event from allEventsData:", JSON.stringify(singleEventExample));
        }
*/

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
    if (expandSeriesFilterEl) {
        expandSeriesFilterEl.removeEventListener('change', applyFilters); 
        expandSeriesFilterEl.addEventListener('change', applyFilters);
    }
    const includeRegularServicesFilterEl = document.getElementById('includeRegularServicesFilter');
    if (includeRegularServicesFilterEl) {
        includeRegularServicesFilterEl.removeEventListener('change', applyFilters);
        includeRegularServicesFilterEl.addEventListener('change', applyFilters);
    }

    if (eventTypeFilterEl) {
        eventTypeFilterEl.innerHTML = '<option value="">-- Select Type --</option>';
        if (allEventsData && allEventsData.length > 0) {
            const uniqueEventTypes = new Set();
            allEventsData.forEach(event => { 
                if(event && event.EventType) uniqueEventTypes.add(event.EventType); 
            });
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
        if (activeFilters[category].size > 0) { 
            activeFilters[category].clear();
            if (category === 'eventType') updateParticipantOptions();
            renderActiveFilterTags();
            applyFilters();
        }
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
            if (activeFilters.participant.size > 0) activeFilters.participant.clear(); 
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
        
        // --- START DEBUG LOGS ---
        console.log("APPLYFILTERS --- START ---");
        const getParentPlaceholders = (arr) => arr.filter(e => e.extendedProps.sourceType && e.extendedProps.sourceType.startsWith('special-event-series-parent'));
        const getRegularServices = (arr) => arr.filter(e => e.extendedProps.sourceType && e.extendedProps.sourceType.startsWith('regular-'));
        const getSeriesInstances = (arr) => arr.filter(e => e.extendedProps.sourceType && e.extendedProps.sourceType.startsWith('special-event-series-instance'));
        const getSingleSpecial = (arr) => arr.filter(e => e.extendedProps.sourceType && e.extendedProps.sourceType.startsWith('special-event-single'));

        console.log(`APPLYFILTERS: Initial from processDataForCalendar: ${eventsToDisplay.length} events.`);
        console.log(`  Initial - Parent Placeholders: ${getParentPlaceholders(eventsToDisplay).length}`, JSON.parse(JSON.stringify(getParentPlaceholders(eventsToDisplay).map(e=>e.title))));
        console.log(`  Initial - Regular Services: ${getRegularServices(eventsToDisplay).length}`);
        console.log(`  Initial - Series Instances: ${getSeriesInstances(eventsToDisplay).length}`);
        console.log(`  Initial - Single Special: ${getSingleSpecial(eventsToDisplay).length}`);


        const activeFiltersState = {};
        for (const category in activeFilters) {
            activeFiltersState[category] = Array.from(activeFilters[category]);
        }
        console.log("APPLYFILTERS: Current Active Filters State:", JSON.stringify(activeFiltersState));
        // --- END DEBUG LOGS ---

        if (activeFilters.eventType.size > 0) {
            eventsToDisplay = eventsToDisplay.filter(fcEvent =>
                fcEvent.extendedProps && [...activeFilters.eventType].some(typeFilter => 
                    String(fcEvent.extendedProps.EventType || "").trim() === typeFilter
                )
            );
            // --- DEBUG LOG ---
            console.log(`APPLYFILTERS: After EventType filter: ${eventsToDisplay.length} events.`);
            console.log(`  After EventType - Parent Placeholders: ${getParentPlaceholders(eventsToDisplay).length}`, JSON.parse(JSON.stringify(getParentPlaceholders(eventsToDisplay).map(e=>e.title))));
            // --- END DEBUG LOG ---
        }

        if (activeFilters.church.size > 0) {
            eventsToDisplay = eventsToDisplay.filter(fcEvent => 
                fcEvent.extendedProps && [...activeFilters.church].some(churchFilter =>
                    String(fcEvent.extendedProps.ChurchID || "").trim() === churchFilter
                )
            );
            // --- DEBUG LOG ---
            console.log(`APPLYFILTERS: After Church filter: ${eventsToDisplay.length} events.`);
            console.log(`  After Church - Parent Placeholders: ${getParentPlaceholders(eventsToDisplay).length}`, JSON.parse(JSON.stringify(getParentPlaceholders(eventsToDisplay).map(e=>e.title))));
            // --- END DEBUG LOG ---
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
            // --- DEBUG LOG ---
            console.log(`APPLYFILTERS: After Participant filter: ${eventsToDisplay.length} events.`);
            console.log(`  After Participant - Parent Placeholders: ${getParentPlaceholders(eventsToDisplay).length}`, JSON.parse(JSON.stringify(getParentPlaceholders(eventsToDisplay).map(e=>e.title))));
            // --- END DEBUG LOG ---
        }

        const includeRegularServicesCheckbox = document.getElementById('includeRegularServicesFilter');
        const regularServicesChecked = includeRegularServicesCheckbox ? includeRegularServicesCheckbox.checked : false; // Default to false if not found
        // --- DEBUG LOG ---
        console.log("APPLYFILTERS: 'Include Regular Services' checkbox checked:", regularServicesChecked);
        // --- END DEBUG LOG ---
        
        if (!regularServicesChecked) { // If "Include Regular Services" is UNCHECKED
            eventsToDisplay = eventsToDisplay.filter(fcEvent =>
                fcEvent.extendedProps.sourceType && 
                fcEvent.extendedProps.sourceType.startsWith('special-event') 
            );
            // --- DEBUG LOG ---
            console.log(`APPLYFILTERS: After 'Include Regular Services' (if unchecked): ${eventsToDisplay.length} events.`);
            console.log(`  After Reg.Svc. (unchecked) - Parent Placeholders: ${getParentPlaceholders(eventsToDisplay).length}`, JSON.parse(JSON.stringify(getParentPlaceholders(eventsToDisplay).map(e=>e.title))));
            // --- END DEBUG LOG ---
        }
        
        // --- DEBUG LOG ---
        console.log(`APPLYFILTERS: Final eventsToDisplay for renderCalendar: ${eventsToDisplay.length} events.`);
        console.log(`  Final - Parent Placeholders: ${getParentPlaceholders(eventsToDisplay).length}`, JSON.parse(JSON.stringify(getParentPlaceholders(eventsToDisplay).map(e=>e.title))));
        console.log("APPLYFILTERS --- END ---");
        // --- END DEBUG LOGS ---

        renderCalendar(eventsToDisplay);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }, 10);
}

function parseSimpleTimeForSort(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return null;
    
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const modifier = match[3] ? match[3].toUpperCase() : null;
    
    if (modifier === "PM" && hours < 12) {
        hours += 12;
    } else if (modifier === "AM" && hours === 12) { // Midnight case: 12 AM is 00 hours
        hours = 0;
    }
    
    return hours * 60 + minutes;
}
function getBestTimeZoneAbbreviation(date, timeZone) {
  try {
    // Use the modern Intl.DateTimeFormat API to get structured parts.
    const options = { timeZone: timeZone, timeZoneName: 'short' };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(part => part.type === 'timeZoneName');

    if (tzPart && tzPart.value) {
      // For major US zones, this is usually reliable (e.g., "CDT", "EDT")
      // and we prefer it over a generic "CT" or "ET".
      if (['CDT', 'CST', 'EDT', 'EST', 'MDT', 'MST', 'PDT', 'PST'].includes(tzPart.value)) {
        return tzPart.value;
      }
    }
  } catch (e) {
    console.warn("Could not format timezone with Intl API, using fallback.", e);
  }

  // If the above fails or the browser gives a generic value, use a manual fallback.
  // This part is less accurate for DST but provides a good user-facing label.
  if (timeZone === 'America/New_York') return 'ET'; // Eastern Time
  if (timeZone === 'America/Chicago') return 'CT'; // Central Time
  if (timeZone === 'America/Denver') return 'MT'; // Mountain Time
  if (timeZone === 'America/Los_Angeles') return 'PT'; // Pacific Time
  
  // Final fallback to the full name if it's an unknown zone
  return timeZone.replace(/_/g, " ");
}
async function populateNavbar() {
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getNav`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for getNav`);
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        
        const links = result.data;
        const navLinksContainer = document.getElementById('dynamicNavLinks');
        if (!navLinksContainer || !links) return;

        links.forEach(link => {
            const li = document.createElement('li');
            li.className = 'nav-item';
            
            const a = document.createElement('a');
            a.className = 'nav-link';
            a.href = link.url;
            a.textContent = link.title;
            // Optional: Open external links in a new tab (adjust your base URL)
            if (!link.url.startsWith('https://d3rkrox.github.io')) { 
               a.target = '_blank';
            }
            li.appendChild(a);
            navLinksContainer.appendChild(li);
        });
    } catch (e) {
        console.error("Could not populate navbar:", e);
        // Optionally display an error to the user in the navbar area
    }
}

document.addEventListener('DOMContentLoaded', function() {
    populateNavbar();
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
        loading: function(isLoading) { /* ... */ },
        datesSet: function(viewInfo) { 
            const expandSeriesCheckbox = document.getElementById('expandSeriesFilter');
            if (expandSeriesCheckbox && viewInfo.view.type === 'listDay') {
                if (!expandSeriesCheckbox.checked) { 
                    expandSeriesCheckbox.checked = true;
                    applyFilters(); 
                }
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
    let timeZoneAbbreviation = '';

    if (info.event.start) {
        const eventDateObj = info.event.start;
        // *** Use our new, more reliable helper function ***
        timeZoneAbbreviation = getBestTimeZoneAbbreviation(eventDateObj, displayTimeZone);

        const datePartModal = eventDateObj.toLocaleDateString('en-US', { timeZone: displayTimeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        let timePartModal = "";
        
        if (!info.event.allDay) { 
             timePartModal = eventDateObj.toLocaleTimeString('en-US', { timeZone: displayTimeZone, hour: 'numeric', minute: 'numeric'});
        }

        const startDisplayStr = `${datePartModal}${timePartModal ? ' at ' + timePartModal : ''} ${timeZoneAbbreviation}`;
        detailsHtml += `<p><strong>When:</strong> ${startDisplayStr}</p>`;
        
        const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (displayTimeZone !== browserTimeZone && !info.event.allDay) {
            detailsHtml += `<p><small>(Your local time: ${info.event.start.toLocaleString()})</small></p>`;
        }
    } else { 
        detailsHtml += `<p><strong>Date:</strong> N/A</p>`; 
    }

    if (info.event.end && !info.event.allDay) {
        const endDisplayStr = info.event.end.toLocaleTimeString('en-US', { timeZone: displayTimeZone, hour: 'numeric', minute: 'numeric'});
        detailsHtml += `<p><strong>End:</strong> ${endDisplayStr} ${timeZoneAbbreviation}</p>`;
    }
    
    detailsHtml += `<p><strong>Type:</strong> ${props.EventType || 'N/A'}</p>`;

    // --- SCHEDULE (from patterns) / DESCRIPTION DISPLAY ---
    const originalEventID = props.EventID;
    const patternsForThisEvent = allServiceSchedulePatterns.filter(p => p && String(p.ParentEventID).trim() === String(originalEventID).trim());

    if (patternsForThisEvent.length > 0) {
        detailsHtml += `<p><strong>Schedule (${timeZoneAbbreviation}):</strong></p>`; // Use the reliable abbreviation
        const patternsByDay = {};
        patternsForThisEvent.forEach(p => {
            if(!p.DayOfWeek) return;
            if(!patternsByDay[p.DayOfWeek]) patternsByDay[p.DayOfWeek] = [];
            patternsByDay[p.DayOfWeek].push(p);
        });

        const dayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Weekdays"];
        let scheduleContent = "<ul>";
        dayOrder.forEach(dayKey => {
            if (patternsByDay[dayKey] && patternsByDay[dayKey].length > 0) {
                scheduleContent += `<li><strong>${dayKey}:</strong><ul>`;
                patternsByDay[dayKey]
                    .sort((a,b) => (parseSimpleTimeForSort(a.ServiceStartTime) || 0) - (parseSimpleTimeForSort(b.ServiceStartTime) || 0)) // Using your existing time sort function
                    .forEach(p => {
                        let patternTimeDisplay = p.ServiceStartTime || '';
                        if (p.ServiceEndTime) patternTimeDisplay += ` - ${p.ServiceEndTime}`;
                        scheduleContent += `<li>${patternTimeDisplay || 'N/A'}: ${p.ServiceSubTitle || 'Service'}</li>`;
                    });
                scheduleContent += `</ul></li>`;
            }
        });
        scheduleContent += "</ul>";
        detailsHtml += scheduleContent;
    }
    
    let descriptionText = (props.Description || '').replace(/\n/g, '<br>');
    if (descriptionText.trim() !== "") {
        detailsHtml += `<h6 class="mt-3">Additional Details:</h6><p>${descriptionText}</p>`;
    } else if (patternsForThisEvent.length === 0) { 
        detailsHtml += `<p><strong>Description:</strong> None</p>`;
    }
    
    // ... (The rest of your eventClick function for Church and Participants remains the same) ...
    const church = allChurchesData.find(c => c && String(c.ChurchID).trim() === String(props.ChurchID).trim());
    if (church) { 
        detailsHtml += `<p><strong>Church:</strong> ${church.ChurchName||'N/A'}</p>`;
        detailsHtml += `<p><strong>Location:</strong> ${props.LocationOverride||church.Address||'N/A'}</p>`;
    }

    const participantsForEvent = allEventParticipantsData.filter(p => p && String(p.EventID).trim() === String(props.EventID).trim());
    if (participantsForEvent.length > 0) {
      // (Your existing participant logic goes here, it does not need to change)
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

