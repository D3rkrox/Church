// app.js

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0svFL0DvyXVMc3ebkKaEyFwVSl3zWe1ff0qO5NQ1J66AlO8YSwYERGqxsZbDhR1K75g/exec';

let allEventsData = [];
let allChurchesData = [];
let allMinistersData = [];
let allEventParticipantsData = [];
let allServiceSchedulePatterns = [];

let calendar;
var eventDetailModalInstance;

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
    try {
        const [
            events, churches, ministers, participants, patterns
        ] = await Promise.all([
            fetchData('Events'),
            fetchData('Churches'),
            fetchData('Ministers'),
            fetchData('EventParticipants'),
            fetchData('ServiceSchedulePatterns')
        ]);

        allEventsData = events || [];
        allChurchesData = churches || [];
        allMinistersData = ministers || [];
        allEventParticipantsData = participants || [];
        allServiceSchedulePatterns = patterns || [];

        if (allEventsData.length === 0 && allChurchesData.length === 0) {
            console.warn("Initial data fetch returned empty for critical data.");
        }

        const calendarEvents = processDataForCalendar();
        renderCalendar(calendarEvents);
        populateFilterDropdowns();

    } catch (error) {
        console.error("Error during application initialization:", error);
    }
}

function renderCalendar(eventsToDisplay) {
    if (calendar) {
        calendar.removeAllEvents();
        calendar.addEventSource(eventsToDisplay);
    } else {
        console.error("Calendar instance not found for renderCalendar.");
    }
}

function populateFilterDropdowns() {
    const eventTypeFilter = document.getElementById('eventTypeFilter');
    const churchFilter = document.getElementById('churchFilter');

    if (!eventTypeFilter || !churchFilter) {
        console.warn("Filter dropdown elements not found in DOM.");
        return;
    }

    eventTypeFilter.innerHTML = '<option value="">All Types</option>';
    churchFilter.innerHTML = '<option value="">All Churches</option>';

    if (allEventsData && allEventsData.length > 0) {
        const uniqueEventTypes = new Set();
        allEventsData.forEach(event => {
            if(event.EventType) uniqueEventTypes.add(event.EventType);
            if(event.extendedProps && event.extendedProps.EventType) uniqueEventTypes.add(event.extendedProps.EventType);
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

    eventTypeFilter.removeEventListener('change', applyFilters);
    churchFilter.removeEventListener('change', applyFilters);
    eventTypeFilter.addEventListener('change', applyFilters);
    churchFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
    const selectedEventType = document.getElementById('eventTypeFilter').value;
    const selectedChurchID = document.getElementById('churchFilter').value;

    let allProcessedCalendarEvents = processDataForCalendar();
    let filteredForDisplay = allProcessedCalendarEvents;

    if (selectedEventType) {
        filteredForDisplay = filteredForDisplay.filter(fcEvent =>
            fcEvent.extendedProps && (
                fcEvent.extendedProps.EventType === selectedEventType ||
                (fcEvent.extendedProps.IsSeriesParent && fcEvent.extendedProps.originalEventType === selectedEventType)
            )
        );
    }
    if (selectedChurchID) {
        filteredForDisplay = filteredForDisplay.filter(fcEvent => fcEvent.extendedProps && fcEvent.extendedProps.ChurchID === selectedChurchID);
    }
    renderCalendar(filteredForDisplay);
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("app.js: DOMContentLoaded event fired.");
    var calendarEl = document.getElementById('calendar');

    if (!calendarEl) {
        console.error("Calendar container #calendar not found in the DOM! FullCalendar cannot be initialized.");
        return;
    }
    if (typeof FullCalendar === 'undefined') {
        console.error("FullCalendar library is not loaded! Check script tags in index.html.");
        return;
    }

    if (typeof bootstrap !== 'undefined' && document.getElementById('eventDetailModal')) {
        try {
            eventDetailModalInstance = new bootstrap.Modal(document.getElementById('eventDetailModal'));
        } catch (e) {
            console.error("Error initializing Bootstrap modal:", e);
        }
    } else {
        console.warn("Bootstrap or #eventDetailModal not found. Modal functionality might be affected.");
    }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        timeZone: 'local',
        events: [],
        eventDidMount: function(info) {
            // This log is still useful for verifying FullCalendar's internal state
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
                const startStr = info.event.start ? info.event.start.toLocaleString() : 'N/A';
                alert(`Event: ${info.event.title}\nStart: ${startStr}`);
                return;
            }

            const props = info.event.extendedProps || {};
            const eventTitle = info.event.title || "Event Details";
            let detailsHtml = `<h4>${eventTitle}</h4>`;
            
            // Use props.eventActualTimeZone for displaying time in event's original zone
            const displayTimeZone = props.eventActualTimeZone || 'UTC'; 

            if (info.event.start) {
                let startDisplayStr = '';
                try {
                    // Vanilla JS toLocaleString and toLocaleTimeString for display
                    const eventDateObj = info.event.start; // This is a JS Date object

                    const datePartModal = eventDateObj.toLocaleDateString('en-US', {
                        timeZone: displayTimeZone,
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });
                    const timePartModal = eventDateObj.toLocaleTimeString('en-US', {
                        timeZone: displayTimeZone,
                        hour: 'numeric', minute: 'numeric', timeZoneName: 'short'
                    });
                    startDisplayStr = `${datePartModal} at ${timePartModal}`;
                    
                } catch (e) {
                    console.error("Error formatting start date for modal with toLocaleString:", e);
                    startDisplayStr = info.event.start.toLocaleString(); // Generic fallback
                }
                detailsHtml += `<p><strong>When:</strong> ${startDisplayStr}</p>`;

                const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (displayTimeZone !== browserTimeZone && displayTimeZone !== 'UTC') {
                    detailsHtml += `<p><small>(Your local time: ${info.event.start.toLocaleString()})</small></p>`;
                }
            } else {
                 detailsHtml += `<p><strong>Date:</strong> N/A</p>`;
            }

            if (info.event.end && !info.event.allDay) {
                 let endDisplayStr = '';
                 try {
                    const eventEndDateObj = info.event.end;
                    endDisplayStr = eventEndDateObj.toLocaleTimeString('en-US', {
                        timeZone: displayTimeZone,
                        hour: 'numeric', minute: 'numeric', timeZoneName: 'short'
                    });
                 } catch (e) {
                    console.error("Error formatting end date for modal:", e);
                    endDisplayStr = info.event.end.toLocaleTimeString();
                 }
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
                    let name = participant.ParticipantNameOverride ? String(participant.ParticipantNameOverride).trim() : null;
                    let role = participant.RoleInEvent ? String(participant.RoleInEvent).trim() : '';
                    if (!name && participant.MinisterID) {
                        const ministerIDToFind = String(participant.MinisterID).trim();
                        const minister = allMinistersData.find(m => String(m.MinisterID).trim() === ministerIDToFind);
                        if (minister) {
                            name = minister.Name ? String(minister.Name).trim() : null; // Assuming 'Name' is the correct field
                        }
                    }
                    detailsHtml += `<li>${name || 'N/A'} ${role ? `(${role})` : ''}</li>`;
                });
                detailsHtml += `</ul>`;
            }

            document.getElementById('eventDetailBody').innerHTML = detailsHtml;
            eventDetailModalInstance.show();
        }
    });

    console.log("app.js: Attempting to render FullCalendar.");
    calendar.render();
    console.log("app.js: FullCalendar render() called. Initializing app data...");
    initializeApp();
});