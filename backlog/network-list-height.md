# My Network list height

The people list on My Network shows about three rows, then scrolls inside itself, even when the page has plenty of room below it.

## Problem

On a 1280×860 window, the list and the thread beside it are cut off about 170px down the page: three people show, and the rest scroll inside a small box with empty white space under it. The thread's "Choose a person" message is cut off the same way. Adding photos and colored initials (#177) made the short list easier to notice, but didn't cause it.

## Direction

The page is a column (`.network-page`, `height: 100%`, `overflow: hidden`) with the split (`.network-split`, `flex: 1 1 auto`, `min-height: 0`) under the heading, in `web/src/career-workspace.css`. The likely cause is that the panel holding the page doesn't give it a definite height, so `height: 100%` resolves to the content's height and the split shrinks. Check the chain of parents from the center panel down to `.network-page` and give the split the remaining height, for example by making each parent a flex column with `min-height: 0`, so the list fills the panel and scrolls only when it runs out of room. Confirm at desktop, tablet, and phone widths, with an empty list and a long one.
