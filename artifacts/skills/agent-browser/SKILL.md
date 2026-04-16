---
name: agent-browser
description: "Automates browser interactions for web testing, form filling, screenshots, and data extraction."
---

# Browser Automation with agent-browser

## Quick start

```bash
agent-browser open <url>        # Navigate to page
agent-browser snapshot -i       # Get interactive elements with refs
agent-browser click @e1         # Click element by ref
agent-browser fill @e2 "text"   # Fill input by ref
agent-browser close             # Close browser
```

## Core workflow

1. Navigate: `agent-browser open <url>`
2. Snapshot: `agent-browser snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation
```bash
agent-browser open <url>      # Navigate to URL (aliases: goto, navigate)
agent-browser back            # Go back
agent-browser forward         # Go forward
agent-browser reload          # Reload page
agent-browser close           # Close browser (aliases: quit, exit)
```

### Snapshot (page analysis)
```bash
agent-browser snapshot            # Full accessibility tree
agent-browser snapshot -i         # Interactive elements only (recommended)
agent-browser snapshot -i -C       # Include cursor-interactive elements (divs with onclick, etc.)
agent-browser snapshot -c         # Compact (remove empty structural elements)
agent-browser snapshot -d 3        # Limit depth to 3
agent-browser snapshot -s "#main"  # Scope to CSS selector
agent-browser snapshot -i -c -d 5 # Combine options
```

The `-C` flag is useful for modern web apps that use custom clickable elements (divs, spans) instead of standard buttons/links.

### Interactions (use @refs from snapshot)
```bash
agent-browser click @e1              # Click (--new-tab to open in new tab)
agent-browser dblclick @e1           # Double-click
agent-browser focus @e1              # Focus element
agent-browser fill @e2 "text"        # Clear and type
agent-browser type @e2 "text"        # Type without clearing
agent-browser keyboard type "text"   # Type with real keystrokes
agent-browser keyboard inserttext "text"  # Insert text without key events
agent-browser press Enter            # Press key
agent-browser press Control+a       # Key combination
agent-browser keydown Shift          # Hold key down
agent-browser keyup Shift            # Release key
agent-browser hover @e1             # Hover
agent-browser check @e1              # Check checkbox
agent-browser uncheck @e1            # Uncheck checkbox
agent-browser select @e1 "value"     # Select dropdown
agent-browser scroll down 500        # Scroll page
agent-browser scrollintoview @e1     # Scroll element into view
agent-browser drag @e1 @e2           # Drag and drop
agent-browser upload @e1 file.pdf   # Upload files
```

### Get information
```bash
agent-browser get text @e1        # Get element text
agent-browser get html @e1        # Get innerHTML
agent-browser get value @e1       # Get input value
agent-browser get attr @e1 href   # Get attribute
agent-browser get title           # Get page title
agent-browser get url             # Get current URL
agent-browser get count ".item"   # Count matching elements
agent-browser get box @e1         # Get bounding box
agent-browser get styles @e1      # Get computed styles
```

### Check state
```bash
agent-browser is visible @e1     # Check if visible
agent-browser is enabled @e1     # Check if enabled
agent-browser is checked @e1     # Check if checked
```

### Screenshots & PDF
```bash
agent-browser screenshot                     # Screenshot
agent-browser screenshot path.png             # Save to file
agent-browser screenshot --full              # Full page
agent-browser screenshot --annotate          # Annotated with numbered labels
agent-browser pdf output.pdf                  # Save as PDF
```

### Video recording
```bash
agent-browser record start ./demo.webm   # Start recording
agent-browser click @e1                   # Perform actions
agent-browser record stop                  # Stop and save
```

### Wait
```bash
agent-browser wait @e1                    # Wait for element
agent-browser wait 2000                    # Wait milliseconds
agent-browser wait --text "Success"       # Wait for text
agent-browser wait --url "**/dashboard"   # Wait for URL pattern
agent-browser wait --load networkidle     # Wait for network idle
```

### Semantic locators
```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find placeholder "Search..." fill "query"
```

### Browser settings
```bash
agent-browser set viewport 1920 1080     # Set viewport
agent-browser set device "iPhone 14"     # Emulate device
agent-browser set geo 37.7749 -122.4194  # Geolocation
agent-browser set offline on             # Offline mode
agent-browser set headers '{"X-Key":"v"}' # HTTP headers
agent-browser set media dark              # Color scheme
```

### Cookies & Storage
```bash
agent-browser cookies                     # Get cookies
agent-browser cookies set name value      # Set cookie
agent-browser cookies clear               # Clear cookies
agent-browser storage local               # localStorage
agent-browser storage session             # sessionStorage
```

### Network
```bash
agent-browser network route <url>              # Intercept
agent-browser network route <url> --abort     # Block
agent-browser network route <url> --body '{}' # Mock
agent-browser network unroute [url]            # Remove
```

### Tabs & Windows
```bash
agent-browser tab                 # List tabs
agent-browser tab new [url]       # New tab
agent-browser tab 2               # Switch
agent-browser tab close           # Close
```

### State management
```bash
agent-browser state save auth.json    # Save auth
agent-browser state load auth.json    # Load auth
agent-browser state list              # List states
```

### Debug
```bash
agent-browser console              # Console messages
agent-browser errors               # Page errors
agent-browser highlight @e1       # Highlight element
agent-browser trace start          # Start trace
agent-browser trace stop trace.zip # Stop
```

## Setup
```bash
agent-browser install                 # Download Chromium
agent-browser install --with-deps     # System deps (Linux)
```

Install: `bun add -g agent-browser && agent-browser install`. Repo: https://github.com/vercel-labs/agent-browser
