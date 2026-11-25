# Privacy Policy

English | [日本語](PRIVACY.ja.md)

This page explains how Command Palette ("the extension") handles data.

## Summary

The extension does not send any data to the developer or to third parties. It does not collect or sell data, or use it for advertising. Everything it reads is used only inside your browser.

## Data it reads and why

| Data | Use |
|---|---|
| URLs and titles of open tabs | Show them as results, switch to the tab you choose, and run tab actions (close, pin, move, and so on) |
| Browsing history | Show pages that match what you type, and remove a page you choose from your history |
| Bookmarks | Show bookmarks that match what you type or a folder name, and bookmark the current page |
| Reading list | Show it as results, add pages, and mark them as read |
| Tab group names | Find tabs by the name of their group, name the groups you create, and find a group with the same name when grouping tabs by domain |
| Recently closed tabs | Show closed tabs that match what you type, and reopen a closed tab |
| Results you pick in the palette | Record how often and when you last picked them, to rank them higher |

## Data it stores

What you enter on the settings page (how long before tabs are closed, Favorites, site search keywords, and so on) is stored in `chrome.storage.sync`. If sync is on in your browser, it is synced to your other devices through your browser account (a Google account in Chrome, a Microsoft account in Edge). The developer cannot see it. The theme you choose is also copied to the extension's `localStorage` on this device, so pages open in the right colors.

The time you last viewed each tab is stored in `chrome.storage.session` and is cleared when you quit the browser.

The results you pick in the palette (page URLs, commands, and bookmark folders), with how often and when you last picked them, are stored in `chrome.storage.local` to rank them higher. They stay on this device and are not synced. Removing a page from your history also removes its record.

## Web search

When you run a web search from the palette, your query goes to the default search engine set in your browser, the same as searching from the address bar.

## Contact

Please open an issue at <https://github.com/takasa5/chrome-command-palette/issues>.

## Changes

If this policy changes, this page will be updated.
