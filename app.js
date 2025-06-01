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
/*
function processDataForCalendar() {
    let processedEvents = [];
    const expandSeriesCheckbox = document.getElementById('expandSeriesFilter');
    const showExpandedSeries = expandSeriesCheckbox ? expandSeriesCheckbox.checked : false;

    const currentViewType = calendar && calendar.view ? calendar.view.type : 'listWeek'; 
    const isListView = currentViewType.startsWith('list');

    // console.log(`VIEW_DEBUG: CurrentView='${currentViewType}', IsListView=${isListView}, ShowExpandedSeries=${showExpandedSeries}`);

    allEventsData.forEach((event, index) => {
        if (!event || !event.EventTitle || !event.StartDate) {
            return;
        }

        const eventSourceType = String(event.sourceType || '').trim();
        const originalIsAllDay = String(event.IsAllDay).toLowerCase() === "true";
        
        const colors = getEventColors(event.EventType);
        const eventClass = getEventTypeClassName(event.EventType);

        // Start with a base FullCalendar event object
        let fcEventData = {
            title: event.EventTitle,
            start: event.StartDate, // Initially UTC ISO string from cache
            end: event.EndDate,     // Initially UTC ISO string from cache
            allDay: originalIsAllDay,
            timeZone: originalIsAllDay ? undefined : (event.eventActualTimeZone || 'America/Chicago'),
            backgroundColor: colors.backgroundColor,
            borderColor: colors.backgroundColor, // Or a slightly darker shade for contrast
            textColor: colors.textColor,
            classNames: [eventClass],
            extendedProps: { ...event, isPlaceholder: false } 
        };

        let addThisEvent = false;

        if (eventSourceType.startsWith('special-event-series-parent')) {
            // Parent series summaries are always treated as all-day for display purposes in the calendar
            fcEventData.allDay = true; 
            fcEventData.timeZone = undefined; // All-day events should use the calendar's local timezone for date rendering
            fcEventData.extendedProps.isPlaceholder = true;

            // Title formatting for the series summary
            let seriesActualStartStrForTitle = event.StartDate ? event.StartDate.substring(0, 10) : null;
            let seriesActualEndExclusiveStrForTitle = event.EndDate ? event.EndDate.substring(0, 10) : null;
            let titleDisplay = `${event.EventTitle} (${event.EventType || 'Series'})`;

            if (seriesActualStartStrForTitle && seriesActualEndExclusiveStrForTitle) {
                // Create Date objects in UTC to correctly get the date parts
                let inclusiveEndDateForTitle = new Date(seriesActualEndExclusiveStrForTitle + "T00:00:00Z"); // Treat as start of exclusive end day
                inclusiveEndDateForTitle.setUTCDate(inclusiveEndDateForTitle.getUTCDate() - 1); // Make it inclusive

                const titleDateOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }; // Display title dates as per their UTC day
                const startTitleStr = new Date(seriesActualStartStrForTitle + "T00:00:00Z").toLocaleDateString('en-US', titleDateOptions);
                
                if (inclusiveEndDateForTitle.getTime() >= new Date(seriesActualStartStrForTitle + "T00:00:00Z").getTime()) {
                    const endTitleStr = inclusiveEndDateForTitle.toLocaleDateString('en-US', titleDateOptions);
                    if (startTitleStr !== endTitleStr) {
                        titleDisplay += ` [${startTitleStr} - ${endTitleStr}]`;
                    } else {
                        titleDisplay += ` [${startTitleStr}]`;
                    }
                } else { 
                    titleDisplay += ` [${startTitleStr}]`;
                }
            } else if (seriesActualStartStrForTitle) {
                const titleDateOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
                const startTitleStr = new Date(seriesActualStartStrForTitle + "T00:00:00Z").toLocaleDateString('en-US', titleDateOptions);
                titleDisplay += ` [${startTitleStr}]`;
            }
            fcEventData.title = titleDisplay;

            // Logic for adding the event
            if (isListView) {
                addThisEvent = true; 
                // For list view, the parent event (which is all-day) will use its full StartDate and EndDate.
                // FullCalendar's list view will show it on each day it spans.
            } else { // For GRID views
                if (!showExpandedSeries) { 
                    addThisEvent = true;
                    // For grid view placeholder, it also uses its full StartDate and EndDate.
                }
                // If series IS expanded in grid view, parent is NOT added (instances will be).
            }
        } else if (eventSourceType.startsWith('special-event-series-instance')) {
            if (!isListView && showExpandedSeries) {
                addThisEvent = true;
            }
        } else if (eventSourceType.startsWith('regular-')) {
            addThisEvent = true;
        } else if (eventSourceType.startsWith('special-event-single')) {
            addThisEvent = true;
        } else { 
            // Fallback for older data without sourceType
            if (String(event.IsSeriesParent).toLowerCase() !== "true" && String(event.isGeneratedInstance).toLowerCase() !== "true") {
                addThisEvent = true; 
                if (fcEventData.allDay) fcEventData.timeZone = undefined;
            }
        }

        if (addThisEvent) {
            // Final date formatting for allDay events to YYYY-MM-DD
            if (fcEventData.allDay) {
                fcEventData.timeZone = undefined; 
                if (fcEventData.start && typeof fcEventData.start === 'string' && fcEventData.start.includes('T')) {
                    fcEventData.start = fcEventData.start.substring(0, 10);
                }
                if (fcEventData.end && typeof fcEventData.end === 'string' && fcEventData.end.includes('T')) {
                    fcEventData.end = fcEventData.end.substring(0, 10);
                }
                // Ensure single all-day events (or placeholders forced to single day in list view previously)
                // have a valid exclusive end if 'end' was null or same as 'start'.
                if (fcEventData.start && fcEventData.start.length === 10 && 
                    (!fcEventData.end || fcEventData.end === fcEventData.start || new Date(fcEventData.end) <= new Date(fcEventData.start))) {
                    // This condition is primarily for true single-day all-day events.
                    // Multi-day series parents should already have a correct exclusive end from cache.
                    if (!eventSourceType.startsWith('special-event-series-parent') || isListView) { // Avoid re-adjusting already correct series parent end for grid
                        let tempEndDate = new Date(fcEventData.start.replace(/-/g, '/'));
                        tempEndDate.setDate(tempEndDate.getDate() + 1);
                        fcEventData.end = tempEndDate.toISOString().substring(0,10);
                    }
                }
            }
            processedEvents.push(fcEventData);
        }
    });
    return processedEvents;
}
*/
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

        //console.log("initializeApp - Raw allEventsData from API:", JSON.parse(JSON.stringify(allEventsData)));
// Log specifically for special event types
const specialParents = allEventsData.filter(e => e.sourceType === 'special-event-series-parent');
const specialInstances = allEventsData.filter(e => e.sourceType === 'special-event-series-instance');
const specialSingles = allEventsData.filter(e => e.sourceType === 'special-event-single');
//console.log(`Found ${specialParents.length} special series parents, ${specialInstances.length} special instances, ${specialSingles.length} single special events in raw data.`);
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
        // Fallback if bootstrap modal instance isn't ready
        alert(`Event: ${info.event.title}\nStart: ${info.event.start ? info.event.start.toLocaleString() : 'N/A'}`);
        return;
    }

    const props = info.event.extendedProps || {};
    const originalEventTitle = props.EventTitle || info.event.title || "Event Details";
    const eventTypeDisplay = props.EventType || 'N/A';

    // Update modal title directly (optional, if you want modal title bar to also change)
    // const modalLabel = document.getElementById('eventDetailModalLabel');
    // if (modalLabel) modalLabel.textContent = originalEventTitle;

    let detailsHtml = `<h4 class="mb-3">${originalEventTitle} <span class="badge bg-secondary">${eventTypeDisplay}</span></h4>`;
    
    const displayTimeZone = props.eventActualTimeZone || 'UTC'; 
    let timeZoneAbbreviation = info.event.start ? getBestTimeZoneAbbreviation(info.event.start, displayTimeZone) : ''; 

    // Icons (Bootstrap Icons SVGs)
    const calendarIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-calendar3 me-2" viewBox="0 0 16 16"><path d="M14 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zM1 3.857C1 3.384 1.448 3 2 3h12c.552 0 1 .384 1 .857v10.286c0 .473-.448.857-1 .857H2c-.552 0-1-.384-1-.857V3.857z"/><path d="M6.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>`;
    const peopleIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-people-fill me-2" viewBox="0 0 16 16"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M5.216 14A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216z"/><path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>`;
    const locationIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-geo-alt-fill me-2" viewBox="0 0 16 16"><path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>`;
    const scheduleIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-list-stars me-2" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M5 11.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5z"/><path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.565.565 0 0 0-.163-.505L1.71 6.745l4.052-.576a.525.525 0 0 0 .393-.288L8 2.223l1.847 3.658a.525.525 0 0 0 .393.288l4.052.575-2.906 2.77a.565.565 0 0 0-.163.506l.694 3.957-3.686-1.894a.503.503 0 0 0-.461 0z"/></svg>`;
    const descriptionIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-text-fill me-2" viewBox="0 0 16 16"><path d="M12 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zM5 4h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1zm-.5 2.5A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zM5 9h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1z"/></svg>`;


    // --- WHEN ---
    let whenLine = "Date N/A";
    if (info.event.start) {
        const startDate = info.event.start;
        const isEventAllDay = info.event.allDay; 
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: displayTimeZone };
        const timeOptions = { hour: 'numeric', minute: '2-digit', timeZone: displayTimeZone };
        let startDateFormatted = startDate.toLocaleDateString('en-US', dateOptions);
        
        if (isEventAllDay) {
            whenLine = startDateFormatted; 
            if (info.event.end) {
                let endDateForDisplay = new Date(info.event.end.getTime()); 
                endDateForDisplay.setUTCDate(endDateForDisplay.getUTCDate() -1); 
                if (endDateForDisplay.getTime() > startDate.getTime()) {
                    let endDateFormatted = endDateForDisplay.toLocaleDateString('en-US', dateOptions);
                    whenLine += ` to ${endDateFormatted}`;
                }
            }
            whenLine += " (All Day)";
        } else { 
            let startTimeFormatted = startDate.toLocaleTimeString('en-US', timeOptions);
            whenLine = `${startDateFormatted}, ${startTimeFormatted}`;
            if (info.event.end && info.event.end.getTime() > startDate.getTime()) {
                const endDate = info.event.end;
                let endDateFormatted = endDate.toLocaleDateString('en-US', dateOptions);
                let endTimeFormatted = endDate.toLocaleTimeString('en-US', timeOptions);
                if (startDate.toDateString() === endDate.toDateString()) { 
                    whenLine += ` - ${endTimeFormatted}`;
                } else { 
                    whenLine += ` to ${endDateFormatted}, ${endTimeFormatted}`;
                }
            }
            whenLine += ` ${timeZoneAbbreviation}`;
        }
    }
    detailsHtml += `<div class="mt-3"><p><strong>${calendarIcon}When:</strong> ${whenLine}</p></div>`;

    // --- FEATURING ---
    const participantsForEvent = (allEventParticipantsData || []).filter(p => p && String(p.EventID).trim() === String(props.EventID).trim());
    if (participantsForEvent.length > 0) {
        detailsHtml += `<div class="mt-3"><p class="mb-1"><strong>${peopleIcon}Featuring:</strong></p><ul class="list-group list-group-flush">`;
        participantsForEvent.forEach((participant, pIndex) => {
            if(!participant) return; 
            
            let name = participant.ParticipantNameOverride ? String(participant.ParticipantNameOverride).trim() : null;
            let role = participant.RoleInEvent ? `(${String(participant.RoleInEvent).trim()})` : ''; 
            let associatedChurchDisplay = ''; 
            let isCollapsibleGroupWithMembers = false;
            let collapseId = '';
            let membersListHtml = '';

            if (participant.GroupID && allGroupsData) { 
                const group = allGroupsData.find(g => g && String(g.GroupID).trim() === String(participant.GroupID).trim());
                if (group) { 
                    name = group.GroupName ? String(group.GroupName).trim() : 'Unnamed Group'; 
                    if (group.AssociatedChurchID && allChurchesData) {
                        const assocChurch = allChurchesData.find(c => c && String(c.ChurchID).trim() === String(group.AssociatedChurchID).trim());
                        if (assocChurch && assocChurch.ChurchName) {
                            associatedChurchDisplay = ` <small class="text-muted">[${assocChurch.ChurchName.trim()}]</small>`;
                        }
                    }
                    if (allGroupMembersData && allGroupMembersData.length > 0) {
                        const members = allGroupMembersData.filter(gm => gm && String(gm.GroupID).trim() === String(participant.GroupID).trim());
                        if (members.length > 0) {
                            isCollapsibleGroupWithMembers = true;
                            collapseId = `group-members-${props.EventID.replace(/[^a-zA-Z0-9]/g, "")}-${participant.GroupID.replace(/[^a-zA-Z0-9]/g, "")}-${pIndex}`;
                            membersListHtml = '<ul class="list-group list-group-flush ps-3 small">'; // Using list-group for members too
                            members.forEach(member => {
                                membersListHtml += `<li class="list-group-item py-1 border-0">${member.MemberName || 'Unknown Member'}</li>`;
                            });
                            membersListHtml += '</ul>';
                        }
                    }
                } else { name = name || 'Group (ID Not Found)'; }
            } else if (participant.MinisterID && allMinistersData) { 
                const minister = allMinistersData.find(m => m && String(m.MinisterID).trim() === String(participant.MinisterID).trim());
                if (minister) { 
                    name = minister.Name ? String(minister.Name).trim() : 'Minister Name Missing'; 
                    if (minister.ChurchID && allChurchesData) {
                        const homeChurch = allChurchesData.find(c => c && String(c.ChurchID).trim() === String(minister.ChurchID).trim());
                        if (homeChurch && homeChurch.ChurchName) {
                            associatedChurchDisplay = ` <small class="text-muted">[${homeChurch.ChurchName.trim()}]</small>`;
                        }
                    }
                } else { name = name || 'Minister (ID Not Found)'; }
            }
            
            name = name || 'N/A'; 

            if (isCollapsibleGroupWithMembers) {
                detailsHtml += `<li class="list-group-item">
                    <a href="#${collapseId}" data-bs-toggle="collapse" role="button" aria-expanded="false" aria-controls="${collapseId}" class="text-decoration-none fw-bold">
                        ${name}
                    </a>
                    ${associatedChurchDisplay} ${role} 
                    <div class="collapse" id="${collapseId}">
                        <div class="mt-1"> ${membersListHtml}
                        </div>
                    </div>
                </li>`;
            } else { 
                detailsHtml += `<li class="list-group-item">${name}${associatedChurchDisplay} ${role}</li>`;
            }
        });
        detailsHtml += `</ul></div>`;
    }

    // --- LOCATION (Church Name) ---
    const church = allChurchesData.find(c => c && String(c.ChurchID).trim() === String(props.ChurchID).trim());
    let locationHtml = "";
    if (church && church.ChurchName) { 
        const encodedAddress = encodeURIComponent(church.Address);
        locationHtml += `${church.ChurchName}<br><a href="https://maps.google.com/?q=${encodedAddress}" target="_blank">${church.Address}</a>`;
        if (props.LocationOverride && String(props.LocationOverride).trim() !== "" && String(props.LocationOverride).trim().toLowerCase() !== church.ChurchName.trim().toLowerCase()) {
            locationHtml += ` (${props.LocationOverride.trim()})`;
        }
    } else if (props.LocationOverride && String(props.LocationOverride).trim() !== "") {
         locationHtml += `${props.LocationOverride.trim()}`;
    } else {
        locationHtml = 'N/A';
    }
    detailsHtml += `<div class="mt-3"><p><strong>${locationIcon}Location:</strong> ${locationHtml}</p></div>`;


    // --- SCHEDULE (from patterns if IsSeriesParent) ---
    let patternsDisplayed = false;
    if (String(props.IsSeriesParent).toLowerCase() === 'true') {
        const originalEventID = props.EventID; 
        const patternsForThisEvent = (allServiceSchedulePatterns || []).filter(p => p && String(p.ParentEventID).trim() === String(originalEventID).trim());
        if (patternsForThisEvent.length > 0) {
            patternsDisplayed = true;
            detailsHtml += `<div class="mt-3"><p class="mb-1"><strong>${scheduleIcon}Schedule (${timeZoneAbbreviation}):</strong></p><ul class="list-group list-group-flush">`;
            const patternsByDay = {};
            patternsForThisEvent.forEach(p => { 
                if(!p.DayOfWeek) return; 
                if(!patternsByDay[p.DayOfWeek]) patternsByDay[p.DayOfWeek] = []; 
                patternsByDay[p.DayOfWeek].push(p); 
            });
            const dayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Weekdays"];
            dayOrder.forEach(dayKey => {
                if (patternsByDay[dayKey] && patternsByDay[dayKey].length > 0) {
                    detailsHtml += `<li class="list-group-item"><strong>${dayKey}:</strong>
                                      <ul class="list-group list-group-flush ps-3">`;
                    patternsByDay[dayKey].sort((a,b) => (parseSimpleTimeForSort(a.ServiceStartTime) || 0) - (parseSimpleTimeForSort(b.ServiceStartTime) || 0))
                        .forEach(p => {
                            let patternTimeDisplay = p.ServiceStartTime || '';
                            if (p.ServiceEndTime) patternTimeDisplay += ` - ${p.ServiceEndTime}`;
                            if (p.ServiceSubTitle) {
                                detailsHtml += `<li class="list-group-item py-1 border-0">${patternTimeDisplay || 'Time N/A'}: ${p.ServiceSubTitle || 'Service'}</li>`;
                            } else {
                                detailsHtml += `<li class="list-group-item py-1 border-0">${patternTimeDisplay || 'Time N/A'} (${timeZoneAbbreviation})</li>`;
                            }
                        });
                    detailsHtml += `</ul></li>`;
                }
            });
            detailsHtml += `</ul></div>`;
        }
    } 
    
    // --- Overall Description ---
    let descriptionText = (props.Description || '').replace(/\n/g, '<br>');
    if (descriptionText.trim() !== "") {
        if (String(props.IsSeriesParent).toLowerCase() === 'true' && patternsDisplayed) {
             detailsHtml += `<div class="mt-3"><p class="mb-1"><strong>${descriptionIcon}Overall Notes:</strong></p><p>${descriptionText}</p></div>`;
        } else {
             detailsHtml += `<div class="mt-3"><p class="mb-1"><strong>${descriptionIcon}Description:</strong></p><p>${descriptionText}</p></div>`;
        }
    } else if (!patternsDisplayed) { 
        detailsHtml += `<div class="mt-3"><p><strong>${descriptionIcon}Description:</strong> None</p></div>`;
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
    const printButton = document.getElementById('printEventDetailButton');
    if (printButton) {
        printButton.addEventListener('click', function() {
            const modalBodyContent = document.getElementById('eventDetailBody').innerHTML;
            const modalTitle = document.getElementById('eventDetailModalLabel').textContent;

            const printWindow = window.open('', '_blank', 'height=600,width=800');
            printWindow.document.write('<html><head><title>' + modalTitle + '</title>');
            // Add some basic print-friendly styles
            printWindow.document.write(`
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h4 { margin-top: 0; }
                    p { margin-bottom: 0.5em; }
                    ul { padding-left: 20px; margin-top: 0.25em; }
                    li { margin-bottom: 0.25em; }
                    hr { margin: 1em 0; }
                    /* Add any other styles you want for the printout */
                </style>
            `);
            printWindow.document.write('</head><body>');
            printWindow.document.write(modalBodyContent);
            printWindow.document.write('</body></html>');
            printWindow.document.close(); // Important for some browsers

            // Wait for content to load before printing for some browsers
            setTimeout(function() {
                printWindow.focus();  // Required for some browsers
                printWindow.print();
                // printWindow.close(); // Close automatically after print dialog (optional)
            }, 250); // Adjust delay if needed
        });
    }
});
