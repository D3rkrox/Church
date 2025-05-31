// app.js

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0svFL0DvyXVMc3ebkKaEyFwVSl3zWe1ff0qO5NQ1J66AlO8YSwYERGqxsZbDhR1K75g/exec';
// 508 Compliant Color Palette for Event Types
// Keys should be lowercase for case-insensitive matching.
// Ensure your EventType strings from Code.gs (derived from sheet data)
// will match these keys after being converted to lowercase.
const eventTypeColors = {
    // Special Event Types (match what's in your "Events" sheet 'EventType' column)
    "revival":                            { backgroundColor: '#003f5c', textColor: '#FFFFFF' }, // Deep Blue
    "revival meeting":                  { backgroundColor: '#003f5c', textColor: '#FFFFFF' }, // Deep Blue
    "singing":                            { backgroundColor: '#228B22', textColor: '#FFFFFF' }, // Forest Green
    "fundraiser":                         { backgroundColor: '#B8860B', textColor: '#FFFFFF' }, // DarkGoldenrod
    "special service":                  { backgroundColor: '#800080', textColor: '#FFFFFF' }, // Purple
    "camp meeting":                     { backgroundColor: '#4682B4', textColor: '#FFFFFF' }, // Steel Blue
    "youth event":                      { backgroundColor: '#5F9EA0', textColor: '#FFFFFF' }, // Cadet Blue
    "concert":                            { backgroundColor: '#D2691E', textColor: '#FFFFFF' }, // Chocolate
    "meeting":                            { backgroundColor: '#6A5ACD', textColor: '#FFFFFF' }, // SlateBlue

    // Regular Service Types (match your 'ServiceTitle' values from "Services" sheet)
    "sunday morning worship":             { backgroundColor: '#ADD8E6', textColor: '#000000' }, // Light Blue
    "sunday evening worship":             { backgroundColor: '#FFFACD', textColor: '#000000' }, // LemonChiffon
    "midweek bible study":                { backgroundColor: '#D3D3D3', textColor: '#000000' }, // Light Grey
    "midweek evening service":            { backgroundColor: '#D3D3D3', textColor: '#000000' }, // Light Grey
    "communion service":                  { backgroundColor: '#8B0000', textColor: '#FFFFFF' }, // Dark Red
    "regular weekend service":            { backgroundColor: '#F0E68C', textColor: '#000000' }, // Khaki

    // For services flagged as communion (e.g., "Sunday Morning Worship (Communion)")
    "sunday morning worship (communion)": { backgroundColor: '#A52A2A', textColor: '#FFFFFF' }, // Brown (distinct from dark red)
    "sunday evening worship (communion)": { backgroundColor: '#A52A2A', textColor: '#FFFFFF' },
    "regular weekend service (communion)":{ backgroundColor: '#A52A2A', textColor: '#FFFFFF' },
    
    // Default color for any unmapped types
    "default":                            { backgroundColor: '#708090', textColor: '#FFFFFF' }  // Slate Grey
};
function getEventColors(eventType) {
    const typeStr = String(eventType || '').trim().toLowerCase();
    return eventTypeColors[typeStr] || eventTypeColors["default"];
}

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
        const isAllDayEvent = String(event.IsAllDay).toLowerCase() === "true";
        
        // Get colors based on the event's EventType
        const colors = getEventColors(event.EventType);
        const eventClass = getEventTypeClassName(event.EventType);


        let fcEventData = {
            title: event.EventTitle,
            start: event.StartDate,
            end: event.EndDate,
            allDay: isAllDayEvent,
            timeZone: isAllDayEvent ? undefined : (event.eventActualTimeZone || 'America/Chicago'),
            backgroundColor: colors.backgroundColor, // Apply background color
            borderColor: colors.backgroundColor,     // Make border same as background (or choose a darker shade)
            textColor: colors.textColor,           // Apply text color for contrast
            classNames: [eventClass],
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

        // Logic for handling different event source types
        if (eventSourceType.startsWith('special-event-series-parent')) {
            if (!showExpandedSeries) {
                fcEventData.allDay = true; 
                fcEventData.title = `${event.EventTitle} (${event.EventType || 'Series'})`; 
                fcEventData.extendedProps.isPlaceholder = true;
                // Placeholder might use its type's color or a specific placeholder color
                // fcEventData.display = 'background'; // If you prefer background events for these
                // fcEventData.backgroundColor = '#eee'; // Example placeholder-specific color
                // fcEventData.textColor = '#000';
                if (fcEventData.start && typeof fcEventData.start === 'string' && fcEventData.start.includes('T')) {
                     fcEventData.start = fcEventData.start.substring(0, 10);
                }
                if (fcEventData.end && typeof fcEventData.end === 'string' && fcEventData.end.includes('T')) {
                     fcEventData.end = fcEventData.end.substring(0, 10);
                } else if (fcEventData.end === null && fcEventData.start) { 
                     let tempEndDate = new Date(fcEventData.start.replace(/-/g, '/')); // Ensure parsing if just YYYY-MM-DD
                     tempEndDate.setDate(tempEndDate.getDate() + 1);
                     fcEventData.end = tempEndDate.toISOString().substring(0,10);
                }
                fcEventData.timeZone = undefined; // Ensure all-day placeholders use calendar's local time

                processedEvents.push(fcEventData);
            }
        } else if (eventSourceType.startsWith('special-event-series-instance')) {
            if (showExpandedSeries) {
                processedEvents.push(fcEventData);
            }
        } else if (eventSourceType.startsWith('regular-')) {
            processedEvents.push(fcEventData);
        } else if (eventSourceType.startsWith('special-event-single')) {
            processedEvents.push(fcEventData);
        } else { 
            if (String(event.IsSeriesParent).toLowerCase() !== "true" && String(event.isGeneratedInstance).toLowerCase() !== "true") {
                if (isAllDayEvent) fcEventData.timeZone = undefined; // Ensure fallback all-day also respects local
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
            fetchData('Events'), fetchData('Churches'), fetchData('Ministers'),
            fetchData('EventParticipants'), fetchData('GuestParticipants'), 
            fetchData('ServiceSchedulePatterns'), fetchData('GroupMembers')
        ]);

        allEventsData = events || [];
        allChurchesData = churches || [];
        allMinistersData = ministers || [];
        allEventParticipantsData = participants || [];
        allGroupsData = guestParticipants || []; 
        allServiceSchedulePatterns = servicePatterns || []; 
        allGroupMembersData = groupMembers || [];

        console.log("initializeApp - Raw allEventsData from API:", JSON.parse(JSON.stringify(allEventsData)));
// Log specifically for special event types
const specialParents = allEventsData.filter(e => e.sourceType === 'special-event-series-parent');
const specialInstances = allEventsData.filter(e => e.sourceType === 'special-event-series-instance');
const specialSingles = allEventsData.filter(e => e.sourceType === 'special-event-single');
console.log(`Found ${specialParents.length} special series parents, ${specialInstances.length} special instances, ${specialSingles.length} single special events in raw data.`);
        populateFilterDropdowns(); // Call this first
        applyFilters();            // Then apply filters for initial render

    } catch (error) {
        console.error("Error during application initialization:", error);
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.textContent = 'Failed to load calendar data. Please try refreshing. Error: ' + error.message;
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
            let displayValue = value; let categoryLabel = "";
            if (category === 'church' && allChurchesData) {
                const church = allChurchesData.find(c => c && String(c.ChurchID) === String(value));
                if (church) displayValue = church.ChurchName || value;
                categoryLabel = "Church";
            } else if (category === 'eventType') { categoryLabel = "Type";
            } else if (category === 'participant') { categoryLabel = "Participant"; }
            const tag = document.createElement('span');
            tag.className = 'filter-tag';
            tag.setAttribute('data-filter-category', category);
            tag.setAttribute('data-filter-value', value); 
            tag.innerHTML = `${categoryLabel}: ${displayValue} <button type="button" class="btn-close-custom" aria-label="Remove filter">&times;</button>`;
            tag.querySelector('.btn-close-custom').addEventListener('click', function() { handleRemoveFilter(category, value); });
            container.appendChild(tag);
        });
    });
    container.style.display = hasActiveFilters ? 'block' : 'none';
    if (hasActiveFilters) showFilterCollapse();
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
        if (activeEventTypeFilters.some(type => type.toLowerCase() === "singing")) filterMode = "singing";
        else if (activeEventTypeFilters.some(type => type.toLowerCase() === "revival" || type.toLowerCase() === "revival meeting")) filterMode = "revival";
    }
    if (filterMode === "singing") {
        if (allGroupsData && allGroupsData.length > 0) allGroupsData.forEach(group => { if (group && group.GroupName) uniqueParticipants.add(String(group.GroupName).trim()); });
        allEventParticipantsData.forEach(p => { if (p && p.ParticipantNameOverride && !p.MinisterID && !p.GroupID) uniqueParticipants.add(String(p.ParticipantNameOverride).trim()); });
    } else if (filterMode === "revival") {
        if (allMinistersData && allMinistersData.length > 0) allMinistersData.forEach(minister => { if (minister && minister.Name) uniqueParticipants.add(String(minister.Name).trim()); });
    } else { 
        if (allEventParticipantsData && allEventParticipantsData.length > 0) {
            allEventParticipantsData.forEach(participant => {
                if(!participant) return;
                if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() !== "") uniqueParticipants.add(String(participant.ParticipantNameOverride).trim());
                else if (participant.MinisterID && allMinistersData) {
                    const minister = allMinistersData.find(m => m && String(m.MinisterID).trim() === String(participant.MinisterID).trim());
                    if (minister && minister.Name) uniqueParticipants.add(String(minister.Name).trim());
                } else if (participant.GroupID && allGroupsData) { 
                    const group = allGroupsData.find(g => g && String(g.GroupID).trim() === String(participant.GroupID).trim());
                    if (group && group.GroupName) uniqueParticipants.add(String(group.GroupName).trim());
                }
            });
        }
    }
    [...uniqueParticipants].filter(Boolean).sort().forEach(name => participantFilterEl.add(new Option(name, name)));
    let participantFilterChanged = false;
    previouslyActiveParticipantFilters.forEach(activeP => {
        if (!uniqueParticipants.has(activeP)) { activeFilters.participant.delete(activeP); participantFilterChanged = true; }
    });
    if (participantFilterChanged) renderActiveFilterTags(); 
}

// --- REPLACE THIS ENTIRE FUNCTION ---
function populateFilterDropdowns() {
    const eventTypeFilterEl = document.getElementById('eventTypeFilter');
    const churchFilterEl = document.getElementById('churchFilter');
    // const participantFilterEl = document.getElementById('participantFilter'); // Populated by updateParticipantOptions
    
    const expandSeriesCheckbox = document.getElementById('expandSeriesFilter');
    const includeRegularServicesCheckbox = document.getElementById('includeRegularServicesFilter');

    // Determine visibility based on checkboxes
    const showExpandedSeries = expandSeriesCheckbox ? expandSeriesCheckbox.checked : false;
    const includeRegular = includeRegularServicesCheckbox ? includeRegularServicesCheckbox.checked : true; // Default to true if element not found

    let relevantEventsForTypeFilter = [];
    if (allEventsData && allEventsData.length > 0) {
        allEventsData.forEach(event => {
            if (!event || !event.EventType) return; 

            const eventSourceType = String(event.sourceType || '').trim();
            let isPotentiallyVisibleBasedOnSeriesLogic = false;

            // 1. Determine visibility based on series expansion logic (mimics processDataForCalendar)
            if (eventSourceType.startsWith('special-event-series-parent')) {
                if (!showExpandedSeries) isPotentiallyVisibleBasedOnSeriesLogic = true;
            } else if (eventSourceType.startsWith('special-event-series-instance')) {
                if (showExpandedSeries) isPotentiallyVisibleBasedOnSeriesLogic = true;
            } else if (eventSourceType.startsWith('regular-')) {
                isPotentiallyVisibleBasedOnSeriesLogic = true; 
            } else if (eventSourceType.startsWith('special-event-single')) {
                isPotentiallyVisibleBasedOnSeriesLogic = true;
            } else { 
                // Fallback for events that might not have a sourceType yet (older data)
                // This logic assumes if no sourceType, it's from "Events" sheet
                if (String(event.IsSeriesParent).toLowerCase() !== "true" && String(event.isGeneratedInstance).toLowerCase() !== "true") {
                    isPotentiallyVisibleBasedOnSeriesLogic = true; // It's a single event
                } else if (String(event.IsSeriesParent).toLowerCase() === "true" && !showExpandedSeries) {
                    isPotentiallyVisibleBasedOnSeriesLogic = true; // It's a series parent, and we're showing parents
                } else if (String(event.isGeneratedInstance).toLowerCase() === "true" && showExpandedSeries) {
                    isPotentiallyVisibleBasedOnSeriesLogic = true; // It's a series instance, and we're showing instances
                }
            }

            // 2. Further filter based on "Include Regular Services" logic
            if (isPotentiallyVisibleBasedOnSeriesLogic) {
                if (!includeRegular && eventSourceType.startsWith('regular-')) {
                    // If regular services are NOT included, and this IS a regular service, then it's NOT relevant for type filter
                } else {
                    relevantEventsForTypeFilter.push(event);
                }
            }
        });
    }

    // Populate Event Types dropdown
    if (eventTypeFilterEl) {
        const currentActiveEventTypes = new Set(activeFilters.eventType); 
        let activeFilterWasRemoved = false;

        eventTypeFilterEl.innerHTML = '<option value="">-- Select Type --</option>';
        const uniqueEventTypes = new Set();
        relevantEventsForTypeFilter.forEach(event => { 
            if(event.EventType) uniqueEventTypes.add(String(event.EventType).trim()); 
        });
        
        const sortedUniqueEventTypes = [...uniqueEventTypes].filter(Boolean).sort();
        sortedUniqueEventTypes.forEach(type => eventTypeFilterEl.add(new Option(type, type)));

        // Check if previously active event types are still valid options
        currentActiveEventTypes.forEach(activeType => {
            if (!sortedUniqueEventTypes.includes(activeType)) {
                activeFilters.eventType.delete(activeType);
                activeFilterWasRemoved = true;
            }
        });

        if (activeFilterWasRemoved) {
            renderActiveFilterTags(); 
            updateParticipantOptions(); 
            // Important: If an active filter was removed because its type is no longer available,
            // we need to re-apply all filters to update the calendar.
            // However, applyFilters will be called by handleCheckboxChange anyway.
        }
    }

    // Populate Churches (this part's logic remains unchanged)
    if (churchFilterEl) {
        const currentSelectedChurch = churchFilterEl.value; // Preserve selection if possible
        churchFilterEl.innerHTML = '<option value="">-- Select Church --</option>';
        if (allChurchesData && allChurchesData.length > 0) {
            allChurchesData.sort((a, b) => ((a?a.ChurchName:"") || "").localeCompare((b?b.ChurchName:"") || "")).forEach(church => {
                if (church && church.ChurchID && church.ChurchName) {
                     const option = new Option(church.ChurchName, church.ChurchID);
                     churchFilterEl.add(option);
                }
            });
            // Try to restore selection if it's still a valid option
            if (Array.from(churchFilterEl.options).some(opt => opt.value === currentSelectedChurch)) {
                churchFilterEl.value = currentSelectedChurch;
            }
        }
    }
    
    // Update Participant Options (this will be re-evaluated based on current event types)
    updateParticipantOptions(); 
}
// --- END REPLACEMENT ---


// --- NEW FUNCTION ---
function handleCheckboxChange() {
    populateFilterDropdowns(); // Update dropdowns and potentially prune active eventType filters
    applyFilters();            // Then re-apply all filters to the calendar
}
// --- END NEW FUNCTION ---

function handleAddFilter(category, value) { /* ... This function remains the same from your file, ensure it clears category for single-select like behavior ... */
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
    // For dropdowns acting as "add filter" buttons (single select tag for category)
    //activeFilters[category].clear(); 
    activeFilters[category].add(value);

    if (category === 'eventType') {
        updateParticipantOptions(); 
    }
    renderActiveFilterTags();
    applyFilters();
    
    const filterDropdown = document.getElementById(category + 'Filter');
    if (filterDropdown) filterDropdown.selectedIndex = 0; // Reset dropdown after adding tag
}
function handleRemoveFilter(category, value) { 
    if (activeFilters[category] && activeFilters[category].has(value)) { 
        activeFilters[category].delete(value);
        renderActiveFilterTags(); 
        if (category === 'eventType') {
            updateParticipantOptions(); 
            // After removing an event type, the dropdown options might need to refresh
            // if the removed type was the *only* one making other types visible.
            // However, populateFilterDropdowns is now primarily called by checkbox changes.
            // For simplicity, we might not need to call populateFilterDropdowns here unless issues arise.
        }
        applyFilters();
    }
}
function handleEventTypeFilterChange(e) { if(e.target) handleAddFilter('eventType', e.target.value); }
function handleChurchFilterChange(e) { if(e.target) handleAddFilter('church', e.target.value); }
function handleParticipantFilterChange(e) { if(e.target) handleAddFilter('participant', e.target.value); }

function applyFilters() { /* ... This function remains the same from your file, including the "Include Regular Services" check ... */ 
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    setTimeout(() => {
        let eventsToDisplay = processDataForCalendar(); 
        if (activeFilters.eventType.size > 0) {
            eventsToDisplay = eventsToDisplay.filter(fcEvent => fcEvent.extendedProps && [...activeFilters.eventType].some(typeFilter => String(fcEvent.extendedProps.EventType || "").trim() === typeFilter));
        }
        if (activeFilters.church.size > 0) {
            eventsToDisplay = eventsToDisplay.filter(fcEvent => fcEvent.extendedProps && [...activeFilters.church].some(churchFilter => String(fcEvent.extendedProps.ChurchID || "").trim() === churchFilter));
        }
        if (activeFilters.participant.size > 0) {
            eventsToDisplay = eventsToDisplay.filter(fcEvent => { /* ... your participant filter logic ... */
                if (!fcEvent.extendedProps || !fcEvent.extendedProps.EventID) return false;
                const originalEventID = String(fcEvent.extendedProps.EventID).trim(); 
                const participantsInThisEvent = allEventParticipantsData.filter(p => p && String(p.EventID).trim() === originalEventID);
                if (participantsInThisEvent.length === 0) return false;
                return participantsInThisEvent.some(participant => {
                    if(!participant) return false; let nameToCheck = null;
                    if (participant.ParticipantNameOverride && String(participant.ParticipantNameOverride).trim() !== "") nameToCheck = String(participant.ParticipantNameOverride).trim();
                    else if (participant.MinisterID && allMinistersData) {
                        const minister = allMinistersData.find(m => m && String(m.MinisterID).trim() === String(participant.MinisterID).trim());
                        if (minister && minister.Name) nameToCheck = String(minister.Name).trim();
                    } else if (participant.GroupID && allGroupsData) {
                        const group = allGroupsData.find(g => g && String(g.GroupID).trim() === String(participant.GroupID).trim());
                        if (group && group.GroupName) nameToCheck = String(group.GroupName).trim();
                    }
                    return nameToCheck && activeFilters.participant.has(nameToCheck);
                });
            });
        }
        const includeRegularServicesCheckbox = document.getElementById('includeRegularServicesFilter');
        const regularServicesChecked = includeRegularServicesCheckbox ? includeRegularServicesCheckbox.checked : false;
        if (!regularServicesChecked) { 
            eventsToDisplay = eventsToDisplay.filter(fcEvent => fcEvent.extendedProps.sourceType && fcEvent.extendedProps.sourceType.startsWith('special-event'));
        }
        renderCalendar(eventsToDisplay);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }, 10);
}

// Helper functions (parseSimpleTimeForSort, getBestTimeZoneAbbreviation) remain the same
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
function getEventTypeClassName(eventType) {
    const typeStr = String(eventType || 'default').trim().toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/[^a-z0-9-]/g, ''); // Remove special characters
    return `event-type-${typeStr || 'default'}`;
}
// --- MODIFIED: DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', function() {
    populateNavbar(); // Keep this first

    // Setup FullCalendar instance
    var calendarEl = document.getElementById('calendar');
    if (!calendarEl) { console.error("Calendar #calendar not found!"); return; }
    if (typeof FullCalendar === 'undefined') { console.error("FullCalendar library not loaded!"); return; }
    
    const filterCollapseElement = document.getElementById('filterCollapse');
    if (filterCollapseElement && typeof bootstrap !== 'undefined') {
        filterCollapseInstance = new bootstrap.Collapse(filterCollapseElement, { toggle: true }); // Start expanded
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
        eventDisplay: 'block',
        timeZone: 'local', 
        events: [], 
        weekends: true,
        loading: function(isLoading) {
            const loadingEl = document.getElementById('loading-indicator');
            if(loadingEl) loadingEl.style.display = isLoading ? 'block' : 'none';
        },
        datesSet: function(viewInfo) { 
            const expandSeriesCheckbox = document.getElementById('expandSeriesFilter');
            if (expandSeriesCheckbox && viewInfo.view.type === 'listDay') {
                if (!expandSeriesCheckbox.checked) { 
                    expandSeriesCheckbox.checked = true;
                    handleCheckboxChange(); // Use the new handler
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
        const encodedAddress = encodeURIComponent(church.Address);
        detailsHtml += `<p><strong>Church:</strong> ${church.ChurchName||'N/A'}</p>`;
        detailsHtml += `<p><strong>Location:</strong> ${props.LocationOverride||`<a href="https://maps.google.com/?q=${encodedAddress}" target="_blank">${church.Address}</a>`||'N/A'}</p>`;
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
    
    // Add event listeners to filter dropdowns
    const eventTypeFilterEl = document.getElementById('eventTypeFilter');
    const churchFilterEl = document.getElementById('churchFilter');
    const participantFilterEl = document.getElementById('participantFilter');
    if(eventTypeFilterEl) eventTypeFilterEl.addEventListener('change', handleEventTypeFilterChange);
    if(churchFilterEl) churchFilterEl.addEventListener('change', handleChurchFilterChange);
    if(participantFilterEl) participantFilterEl.addEventListener('change', handleParticipantFilterChange);

    // --- MODIFIED: Add event listeners to checkboxes to use the new handler ---
    const expandSeriesFilterEl = document.getElementById('expandSeriesFilter'); 
    const includeRegularServicesFilterEl = document.getElementById('includeRegularServicesFilter');
    if (expandSeriesFilterEl) {
        expandSeriesFilterEl.addEventListener('change', handleCheckboxChange);
    }
    if (includeRegularServicesFilterEl) {
        includeRegularServicesFilterEl.addEventListener('change', handleCheckboxChange);
    }
    // --- END MODIFIED ---

    initializeApp(); 
});
