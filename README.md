# Heolia Turn System for Owlbear Rodeo

A turn tracking extension for Owlbear Rodeo that helps game masters manage combat and initiative order.

## Features

- **Random D100 Initiative**: Automatically assigns a random d100 roll (1-100) for initiative when characters are added
- **Ascending Initiative Order**: Characters are sorted with lowest initiative first
- **Token Highlighting**: Highlights the active token on the map
- **Turn Management**: Easily navigate between turns with next/previous buttons
- **Character Management**: Add tokens via selection or right-click context menu
- **Initiative Adjustment**: Fine-tune initiative order with intuitive controls
- **Persistent State**: Turn order and current turn state are saved and synced across all players
- **Invocation System**: Handle turn for pets and summoned creatures

## Installation

1. In Owlbear Rodeo, click on the "Extensions" button in the sidebar
2. Click "Add Extension"
3. Enter the URL for this extension: ``

## Usage

1. Add character tokens to your scene
2. Select tokens and click "Add Selected" or right-click tokens and select "Add to Turn Order"
3. Use the Next/Previous buttons to advance through turns
4. Adjust initiative values using the up/down buttons as needed
5. Remove tokens from the initiative order using the × button

## Development

This extension is built using:
- Owlbear Rodeo SDK (v1.3.4+)
- Vanilla JavaScript
- Vite for building

### Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## License

MIT

Copyright (C) 2025 Heolia
