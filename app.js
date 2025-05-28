// app.js

// Your Google Apps Script Web App URL - Ensure this is correct
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0svFL0DvyXVMc3ebkKaEyFwVSl3zWe1ff0qO5NQ1J66AlO8YSwYERGqxsZbDhR1K75g/exec';

// Global data arrays
let allEventsData = [];
let allChurchesData = [];
let allMinistersData = [];
let allEventParticipantsData = [];
let allGroupsData = [];
// allServiceSchedulePatterns is no longer directly used by app.js if Apps Script expands series events
// let allServiceSchedulePatterns = [];

// FullCalendar instance
let calendar;
// Bootstrap Modal instance
var eventDetailModalInstance;

/**
 * Fetches data from the Google Apps Script.
 * @param {string} sheetName - The name of the sheet to fetch.
 * @returns {Promise<Array>} A promise that resolves with the sheet data.
 */
async function fetchData(sheetName) {
    try {
        const response = await fetch(`${SCRIPT_URL}?sheet=${sheetName}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for sheet ${sheetName}`);
        }
        const result = await response.json();
        if (result.error) {
            console.error(`API error for sheet ${sheetName}:`, result.error, result);
            throw new Error(`API error for sheet ${sheetName}: ${result.error}`);
        }
        // console.log(`Successfully fetched ${sheetName}:`, result.data);
        return result.data || [];
    } catch (error) {
        console.error(`Error fetching ${sheetName}:`, error);
        return [];
    }
}

/**
 * Processes raw event data (now with UTC dates from Apps Script)
 * into FullCalendar compatible event objects.
 * @returns {Array} Array of event objects for FullCalendar.
 */
function processDataForCalendar() {
    let processedEvents = [];
    const defaultFallbackTimeZone = 'America/Chicago'; // Fallback if event.eventActualTimeZone is missing

    // console.log("RAW EVENTS DATA (app.js - from Apps Script):", JSON.parse(JSON.stringify(allEventsData)));

    allEventsData.forEach(event => {
        if (!event || !event.EventTitle || !event.StartDate) {
            // console.warn("Skipping event in app.js - missing Title or StartDate:", event.EventTitle || "Unknown Title", event);
            return;
        }

        // Data from Apps Script is now trusted to be correct:
        // event.StartDate: UTC 'Z' string
        // event.EndDate: UTC 'Z' string or null
        // event.IsAllDay: boolean
        // event.eventActualTimeZone: IANA string
        // event.StartTime / event.EndTime: simple time strings (e.g., "08:00 PM")

        let fcStart = event.StartDate; // Directly use UTC ISO 'Z' string from Apps Script
        let fcEnd = event.EndDate;     // Directly use UTC ISO 'Z' string from Apps Script (or null)
        const isAllDay = event.IsAllDay === true || String(event.IsAllDay).toUpperCase() === "TRUE";
        const eventTimeZoneForFC = event.eventActualTimeZone || defaultFallbackTimeZone;

        // If Apps Script sends UTC 'Z' strings for all-day events (e.g., "2025-06-09T05:00:00.000Z" for start of day CDT)
        // and isAllDay is true, FullCalendar handles it by taking the date part.
        // To be explicit and provide "YYYY-MM-DD" for allDay for FullCalendar start/end:
        if (isAllDay) {
            if (fcStart && typeof fcStart === 'string' && fcStart.includes('T')) {
                fcStart = fcStart.substring(0, 10); // Extract "YYYY-MM-DD"
            }
            if (fcEnd && typeof fcEnd === 'string' && fcEnd.includes('T')) {
                // Apps Script should send EndDate for all-day as exclusive (next day UTC midnight)
                fcEnd = fcEnd.substring(0, 10); // Extract "YYYY-MM-DD"
            }
        }
        
        // console.log("Pushing to FullCalendar:", event.EventTitle, "Start:", fcStart, "End:", fcEnd, "TZ:", eventTimeZoneForFC, "AllDay:", isAllDay);
        processedEvents.push({
            title: event.EventTitle,
            start: fcStart, 
            end: fcEnd,     
            allDay: isAllDay,
            timeZone: eventTimeZoneForFC, // Tells FullCalendar the event's original zone context for display
            extendedProps: {
                ...event // This now includes original StartTime, EndTime (simple strings), Description, eventActualTimeZone etc.
                         // originalTimeZone can be taken from event.eventActualTimeZone if needed by modal explicitly
            }
        });
    });

    // console.log("FINAL PROCESSED EVENTS for FullCalendar:", processedEvents);
    return processedEvents;
}

/**
 * Initializes the application: fetches all data, then processes and renders it.
 */
async function initializeApp() {
    // document.getElementById('loading-indicator').style.display = 'block';
    try {
        const [
            events, // This should now be a flat list of all occurrences from Apps Script
            churches,
            ministers,
            participants,
            guestparticipants
            // No need to fetch allServiceSchedulePatterns if Apps Script expands series
        ] = await Promise.all([
            fetchData('Events'),
            fetchData('Churches'),
            fetchData('Ministers'),
            fetchData('EventParticipants'),
            //fetchData('ServiceSchedulePatterns'),
            fetchData('GuestParticipants')
            
        ]);

        allEventsData = events || [];
        allChurchesData = churches || [];
        allMinistersData = ministers || [];
        allEventParticipantsData = participants || [];
        //allServiceSchedulePatterns = patterns || []; 
        allGroupsData = guestparticipants || [];

        if (allEventsData.length === 0 && allChurchesData.length === 0) {
            console.warn("Initial data fetch returned empty for critical data (Events/Churches). Check Apps Script and Sheet names.");
        }

        const calendarEvents = processDataForCalendar();
        renderCalendar(calendarEvents);
        populateFilterDropdowns();

    } catch (error) {
        console.error("Error during application initialization:", error);
        // document.getElementById('error-container').textContent = 'Failed to initialize application data. Please refresh.';
        // document.getElementById('error-container').style.display = 'block';
    } finally {
        // document.getElementById('loading-indicator').style.display = 'none';
    }
}

/**
 * Renders events on the FullCalendar instance.
 * @param {Array} eventsToDisplay - Array of event objects for FullCalendar.
 */
function renderCalendar(eventsToDisplay) {
    if (calendar) {
        calendar.removeAllEvents();
        calendar.addEventSource(eventsToDisplay);
    } else {
        console.error("Calendar instance not found for renderCalendar. Was it initialized in DOMContentLoaded?");
    }
}

/**
 * Populates filter dropdowns based on fetched data.
 */
function populateFilterDropdowns() {
    const eventTypeFilter = document.getElementById('eventTypeFilter');
    const churchFilter = document.getElementById('churchFilter');
    const participantFilter = document.getElementById('participantFilter');

    if (!eventTypeFilter || !churchFilter || !participantFilter) {
        // console.warn("Filter dropdown elements not found in DOM."); // Less critical if one is missing
        return;
    }

    eventTypeFilter.innerHTML = '<option value="">All Types</option>';
    churchFilter.innerHTML = '<option value="">All Churches</option>';
    participantFilter.innerHTML = '<option value="">All Ministers/Groups</option>';

    if (allEventsData && allEventsData.length > 0) {
        const uniqueEventTypes = new Set();
        allEventsData.forEach(event => { // event here is an object from allEventsData
            if(event.EventType) uniqueEventTypes.add(event.EventType);
        });
        const eventTypes = [...uniqueEventTypes].filter(Boolean).sort();
        eventTypes.forEach(type => {
            const option = document.createElement('option'); option.value = type; option.textContent = type; eventTypeFilter.appendChild(option);
        });
    }

    if (allChurchesData && allChurchesData.length > 0) {
        allChurchesData.sort((a, b) => (a.ChurchName || "").localeCompare(b.ChurchName || "")).forEach(church => {
            if (church.ChurchID && church.ChurchName) {
                const option = document.createElement('option'); option.value = church.ChurchID; option.textContent = church.ChurchName; churchFilter.appendChild(option);
            }
        });
    }
    
    if (allEventParticipantsData && allEventParticipantsData.length > 0) {
        const uniqueParticipants = new Set();
        allEventParticipantsData.forEach(participant => {
            if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() !== "") {
                uniqueParticipants.add(String(participant.ParticipantNameOverride).trim());
            } else if (participant.MinisterID && allMinistersData) {
                const minister = allMinistersData.find(m => String(m.MinisterID).trim() === String(participant.MinisterID).trim());
                if (minister && minister.Name && String(minister.Name).trim() !== "") {
                    uniqueParticipants.add(String(minister.Name).trim());
                }
            } else if (participant.GroupID && typeof allGroupsData !== 'undefined' && allGroupsData) { // Check if allGroupsData is defined
                const group = allGroupsData.find(g => String(g.GroupID).trim() === String(participant.GroupID).trim());
                if (group && group.GroupName && String(group.GroupName).trim() !== "") {
                    uniqueParticipants.add(String(group.GroupName).trim());
                }
            }
        });
        const sortedParticipants = [...uniqueParticipants].filter(Boolean).sort();
        sortedParticipants.forEach(name => {
            const option = document.createElement('option'); option.value = name; option.textContent = name; participantFilter.appendChild(option);
        });
    }

    eventTypeFilter.removeEventListener('change', applyFilters);
    churchFilter.removeEventListener('change', applyFilters);
    participantFilter.removeEventListener('change', applyFilters); 
    eventTypeFilter.addEventListener('change', applyFilters);
    churchFilter.addEventListener('change', applyFilters);
    participantFilter.addEventListener('change', applyFilters);
}

/**
 * Applies filters to the events displayed on the calendar.
 */
function applyFilters() {
    const selectedEventType = document.getElementById('eventTypeFilter').value;
    const selectedChurchID = document.getElementById('churchFilter').value;
    const selectedParticipantName = document.getElementById('participantFilter').value;

    let currentProcessedFcEvents = processDataForCalendar(); 
    let filteredForDisplay = currentProcessedFcEvents;

    if (selectedEventType) {
        filteredForDisplay = filteredForDisplay.filter(fcEvent =>
            fcEvent.extendedProps && String(fcEvent.extendedProps.EventType).trim() === selectedEventType
        );
    }
    if (selectedChurchID) {
        filteredForDisplay = filteredForDisplay.filter(fcEvent => 
            fcEvent.extendedProps && String(fcEvent.extendedProps.ChurchID).trim() === selectedChurchID
        );
    }
    if (selectedParticipantName) {
        filteredForDisplay = filteredForDisplay.filter(fcEvent => {
            if (!fcEvent.extendedProps || !fcEvent.extendedProps.EventID) return false;
            const eventID = String(fcEvent.extendedProps.EventID).trim();
            const participantsInThisEvent = allEventParticipantsData.filter(p => String(p.EventID).trim() === eventID);
            if (participantsInThisEvent.length === 0) return false;
            return participantsInThisEvent.some(participant => {
                if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() === selectedParticipantName) return true;
                if (participant.MinisterID && allMinistersData) {
                    const minister = allMinistersData.find(m => String(m.MinisterID).trim() === String(participant.MinisterID).trim());
                    if (minister && minister.Name && String(minister.Name).trim() === selectedParticipantName) return true;
                }
                if (participant.GroupID && typeof allGroupsData !== 'undefined' && allGroupsData) {
                    const group = allGroupsData.find(g => String(g.GroupID).trim() === String(participant.GroupID).trim());
                    if (group && group.GroupName && String(group.GroupName).trim() === selectedParticipantName) return true;
                }
                return false;
            });
        });
    }
    renderCalendar(filteredForDisplay);
}

// --- DOMContentLoaded Event Listener ---
document.addEventListener('DOMContentLoaded', function() {
    console.log("app.js: DOMContentLoaded event fired.");
    var calendarEl = document.getElementById('calendar');

    if (!calendarEl) { console.error("Calendar #calendar not found!"); return; }
    if (typeof FullCalendar === 'undefined') { console.error("FullCalendar library not loaded!"); return; }
    
    if (typeof bootstrap !== 'undefined' && document.getElementById('eventDetailModal')) {
        try { eventDetailModalInstance = new bootstrap.Modal(document.getElementById('eventDetailModal')); }
        catch (e) { console.error("Error initializing Bootstrap modal:", e); }
    } else { console.warn("Bootstrap or #eventDetailModal not found."); }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'listWeek', // Or your preferred default view
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
        weekends: true, // Ensure weekends are shown
        eventDidMount: function(info) {
            // Keep this for debugging if needed
            // console.log(
            //     "FC EVENT MOUNTED:", "Title:", info.event.title,
            //     "startStr:", info.event.startStr, // This is the UTC Z string or YYYY-MM-DD
            //     "event.timeZone (from event obj):", info.event.timeZone, 
            //     "calculated start (JS Date in browser local):", info.event.start ? info.event.start.toString() : 'N/A',
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
                    // Use original simple StartTime from props if available and not all-day
                    const eventDateObj = info.event.start; // This is a JS Date object (absolute moment)
                    const datePartModal = eventDateObj.toLocaleDateString('en-US', {
                        timeZone: displayTimeZone,
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });
                    
                    let timePartModal = "";
                    if (!info.event.allDay && props.StartTime) {
                        timePartModal = props.StartTime; // Use the simple "hh:mm AM/PM" string
                    } else if (!info.event.allDay) { 
                         timePartModal = eventDateObj.toLocaleTimeString('en-US', {
                            timeZone: displayTimeZone,
                            hour: 'numeric', minute: 'numeric', // timeZoneName: 'short' can be added
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

            if (info.event.end && !info.event.allDay && props.EndTime) { // Use props.EndTime
                 let endDisplayStr = props.EndTime + ` (${displayTimeZone.replace(/_/g," ")})`;
                 detailsHtml += `<p><strong>End:</strong> ${endDisplayStr}</p>`;
            }

            detailsHtml += `<p><strong>Type:</strong> ${props.EventType || 'N/A'}</p>`;
            detailsHtml += `<p><strong>Description:</strong> ${props.Description || 'None'}</p>`;

            const church = allChurchesData.find(c => String(c.ChurchID).trim() === String(props.ChurchID).trim());
            if (church) {
                detailsHtml += `<p><strong>Church:</strong> ${church.ChurchName || 'N/A'}</p>`;
                detailsHtml += `<p><strong>Location:</strong> ${props.LocationOverride || church.Address || 'N/A'}</p>`;
            }

            const participantsForEvent = allEventParticipantsData.filter(p => String(p.EventID).trim() === String(props.EventID).trim());
            if (participantsForEvent.length > 0) {
                detailsHtml += `<p><strong>Featuring:</strong></p><ul>`;
                participantsForEvent.forEach(participant => {
                      let name = null;
                      let role = participant.RoleInEvent ? String(participant.RoleInEvent).trim() : '';
                      let participantChurchName = null;

                if (participant.MinisterID) { 
                    const ministerIDToFind = String(participant.MinisterID).trim();
                    const minister = allMinistersData.find(m => String(m.MinisterID).trim() === ministerIDToFind);
                    console.log(minister)
                if (minister) {
                    name = minister.Name ? String(minister.Name).trim() : 'Unknown Minister';
                    participantChurchName = minister.ChurchName ? String(minister.ChurchName).trim() : null;
                } else {
                    name = 'Minister ID Not Found';
                }
            } else if (participant.GroupID && typeof allGroupsData !== 'undefined' && allGroupsData) { // Check for GroupID
                
                const groupIDToFind = String(participant.GroupID).trim();
                const group = allGroupsData.find(g => String(g.GroupID).trim() === groupIDToFind);
                console.log(group)
                if (group) {
                    name = group.GroupName ? String(group.GroupName).trim() : 'Unknown Group'; // Use GroupName
                    if (group.AssociatedChurchID && allChurchesData) { 
                        const church = allChurchesData.find(c => String(c.ChurchID).trim() === String(group.AssociatedChurchID).trim());
                        if (church) {
                            participantChurchName = church.ChurchName ? String(church.ChurchName).trim() : null;
                        }
                    }
                } else {
                    console.log(participant.GroupID)
                    name = 'Group ID Not Found'; // This would result in "Group ID Not Found (Group)"
                }
            } else if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() !== "") { // Fallback to override
                name = String(participant.ParticipantNameOverride).trim();
            }

            detailsHtml += `<li>${name || 'N/A'} ${participantChurchName ? `[${participantChurchName}]` : ''} ${role ? `(${role})` : ''}</li>`;
                });
                detailsHtml += `</ul>`;
            }

            document.getElementById('eventDetailBody').innerHTML = detailsHtml;
            eventDetailModalInstance.show();
        }
    });

    // console.log("app.js: Attempting to render FullCalendar.");
    calendar.render();
    // console.log("app.js: FullCalendar render() called. Initializing app data...");
    initializeApp();
});