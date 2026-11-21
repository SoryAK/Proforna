# Opportunities map error

The map on Opportunities sometimes throws while the page scrolls.

## Problem

The console shows `Cannot read properties of undefined (reading '_leaflet_pos')`. It appeared in 3 of 4 runs that only opened Opportunities and scrolled the column. It happens without any edit, so it is not tied to a change. The map library throws this when the map is moved or redrawn after its panes are gone, for example during a zoom or fit animation while the component re-renders or unmounts.

## Direction

Reproduce by opening Opportunities and scrolling the left column a few times. Find what re-renders or remounts the map mid-animation (likely a search-area or pin update), and stop animations or skip the move when the map is not attached. Confirm with a run that scrolls repeatedly and logs no errors.
