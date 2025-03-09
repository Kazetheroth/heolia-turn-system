import OBR from "@owlbear-rodeo/sdk";

const ID = "com.heolia.turn-system";
let turnOrder = [];
let currentTurnIndex = -1;
let metadata = null;

// Generate a random d100 roll (1-100)
function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

// Initialize the extension
OBR.onReady(async () => {
  // Set up the metadata
  metadata = await OBR.room.getMetadata();
  
  // Register event handlers
  setupEventHandlers();
  
  // Set up the scene item context menu for adding characters to turn order
  setupContextMenu();
  
  // Initialize turn data from metadata (if any)
  initializeTurnData();
  
  // Update the UI
  updateUI();
});

// Set up event handlers
function setupEventHandlers() {
  // Listen for metadata changes
  OBR.room.onMetadataChange((metadata) => {
    // Update local turnOrder from metadata
    if (metadata[`${ID}/turnOrder`]) {
      turnOrder = metadata[`${ID}/turnOrder`];
    }
    
    if (metadata[`${ID}/currentTurnIndex`] !== undefined) {
      currentTurnIndex = metadata[`${ID}/currentTurnIndex`];
    }
    
    // Update the UI to reflect changes
    updateUI();
  });
  
  // Listen for item deletion to remove from turn order
  OBR.scene.items.onChange((items) => {
    const sceneIds = new Set(items.map(item => item.id));
    // Check if any items in turn order were deleted from the scene
    if (turnOrder.some(entry => !sceneIds.has(entry.id))) {
      // Filter out deleted items
      turnOrder = turnOrder.filter(entry => sceneIds.has(entry.id));
      // Save updated turn order
      saveTurnOrder();
      // Update the UI
      updateUI();
    }
  });
  
  // Set up button click handlers
  document.getElementById("add-selected").addEventListener("click", addSelectedItems);
  document.getElementById("next-turn").addEventListener("click", nextTurn);
  document.getElementById("previous-turn").addEventListener("click", previousTurn);
  document.getElementById("reset-turns").addEventListener("click", resetTurns);
  
  // Set up initiative adjustment handlers
  document.getElementById("turn-list").addEventListener("click", (event) => {
    if (event.target.classList.contains("initiative-up")) {
      const index = parseInt(event.target.dataset.index);
      moveUp(index);
    } else if (event.target.classList.contains("initiative-down")) {
      const index = parseInt(event.target.dataset.index);
      moveDown(index);
    } else if (event.target.classList.contains("remove-item")) {
      const index = parseInt(event.target.dataset.index);
      removeFromTurnOrder(index);
    }
  });
}

// Set up context menu for adding characters to turn order
function setupContextMenu() {
  OBR.contextMenu.create({
    id: `${ID}/context-menu`,
    icons: [
      {
        icon: "/turn.svg",
        label: "Add to Turn Order",
        filter: {
          every: [
            { key: "layer", value: "CHARACTER" },
            { key: "type", value: "IMAGE" }
          ]
        }
      }
    ],
    onClick: (context) => {
      // Add all selected items to turn order
      addItemsToTurnOrder(context.items);
    }
  });
}

// Add selected items to turn order
async function addSelectedItems() {
  const selectedItems = await OBR.player.getSelection();
  addItemsToTurnOrder(selectedItems);
}

// Add items to turn order
function addItemsToTurnOrder(items) {
  // Only add character items
  const newItems = items
    .filter(item => item.layer === "CHARACTER")
    .filter(item => !turnOrder.some(entry => entry.id === item.id))
    .map(item => ({
      id: item.id,
      name: item.text?.plainText || item.name || "Unknown",
      initiative: rollD100(), // Roll a d100 for initiative
      image: item.image?.url
    }));
  
  if (newItems.length > 0) {
    turnOrder = [...turnOrder, ...newItems];
    // Sort by initiative ascending (lower numbers first)
    turnOrder.sort((a, b) => a.initiative - b.initiative);
    // Save turn order
    saveTurnOrder();
    // Update the UI
    updateUI();
  }
}

// Move an entry up in initiative order
function moveUp(index) {
  if (index > 0) {
    // Store current initiative values
    const currentInitiative = turnOrder[index].initiative;
    const prevInitiative = turnOrder[index - 1].initiative;
    
    // Swap initiative values
    turnOrder[index].initiative = prevInitiative - 1;
    
    // Sort by initiative ascending (lower numbers first)
    turnOrder.sort((a, b) => a.initiative - b.initiative);
    saveTurnOrder();
    updateUI();
  }
}

// Move an entry down in initiative order
function moveDown(index) {
  if (index < turnOrder.length - 1) {
    // Store current initiative values
    const currentInitiative = turnOrder[index].initiative;
    const nextInitiative = turnOrder[index + 1].initiative;
    
    // Swap initiative values
    turnOrder[index].initiative = nextInitiative + 1;
    
    // Sort by initiative ascending (lower numbers first)
    turnOrder.sort((a, b) => a.initiative - b.initiative);
    saveTurnOrder();
    updateUI();
  }
}

// Remove an entry from the turn order
function removeFromTurnOrder(index) {
  turnOrder.splice(index, 1);
  
  // Update currentTurnIndex if needed
  if (currentTurnIndex >= turnOrder.length) {
    currentTurnIndex = turnOrder.length - 1;
  }
  
  saveTurnOrder();
  updateUI();
}

// Advance to the next turn
function nextTurn() {
  if (turnOrder.length === 0) return;
  
  currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
  saveCurrentTurnIndex();
  updateUI();
  highlightCurrentToken();
}

// Go back to the previous turn
function previousTurn() {
  if (turnOrder.length === 0) return;
  
  currentTurnIndex = (currentTurnIndex - 1 + turnOrder.length) % turnOrder.length;
  saveCurrentTurnIndex();
  updateUI();
  highlightCurrentToken();
}

// Reset the turn tracker
function resetTurns() {
  currentTurnIndex = -1;
  saveCurrentTurnIndex();
  updateUI();
}

// Highlight the token whose turn it is
async function highlightCurrentToken() {
  // Clear any previous highlights
  const items = await OBR.scene.items.getItems();
  const updatedItems = items.map(item => ({
    id: item.id,
    border: {
      ...item.border,
      color: item.border?.color === "#FF9900" ? "none" : item.border?.color
    }
  }));
  
  await OBR.scene.items.updateItems(updatedItems);
  
  // Add highlight to current token
  if (currentTurnIndex >= 0 && currentTurnIndex < turnOrder.length) {
    const currentItem = turnOrder[currentTurnIndex];
    await OBR.scene.items.updateItems([{
      id: currentItem.id,
      border: {
        width: 5,
        color: "#FF9900"
      }
    }]);
  }
}

// Save the turn order to room metadata
function saveTurnOrder() {
  OBR.room.setMetadata({
    [`${ID}/turnOrder`]: turnOrder
  });
}

// Save the current turn index to room metadata
function saveCurrentTurnIndex() {
  OBR.room.setMetadata({
    [`${ID}/currentTurnIndex`]: currentTurnIndex
  });
}

// Initialize turn data from metadata
function initializeTurnData() {
  if (metadata[`${ID}/turnOrder`]) {
    turnOrder = metadata[`${ID}/turnOrder`];
  }
  
  if (metadata[`${ID}/currentTurnIndex`] !== undefined) {
    currentTurnIndex = metadata[`${ID}/currentTurnIndex`];
  }
}

// Update the UI to reflect the current turn order
function updateUI() {
  const turnList = document.getElementById("turn-list");
  turnList.innerHTML = "";
  
  // Create list items for each entry in turn order
  turnOrder.forEach((entry, index) => {
    const listItem = document.createElement("li");
    listItem.className = "turn-item";
    if (index === currentTurnIndex) {
      listItem.classList.add("current-turn");
    }
    
    // Add character image if available
    if (entry.image) {
      const img = document.createElement("img");
      img.src = entry.image;
      img.className = "character-image";
      listItem.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "character-image-placeholder";
      listItem.appendChild(placeholder);
    }
    
    // Add character name
    const nameSpan = document.createElement("span");
    nameSpan.className = "character-name";
    nameSpan.textContent = entry.name;
    listItem.appendChild(nameSpan);
    
    // Add initiative value
    const initiativeSpan = document.createElement("span");
    initiativeSpan.className = "initiative-value";
    initiativeSpan.textContent = entry.initiative;
    listItem.appendChild(initiativeSpan);
    
    // Add initiative adjustment buttons
    const controlsDiv = document.createElement("div");
    controlsDiv.className = "initiative-controls";
    
    const upButton = document.createElement("button");
    upButton.className = "initiative-up";
    upButton.textContent = "▲";
    upButton.dataset.index = index;
    controlsDiv.appendChild(upButton);
    
    const downButton = document.createElement("button");
    downButton.className = "initiative-down";
    downButton.textContent = "▼";
    downButton.dataset.index = index;
    controlsDiv.appendChild(downButton);
    
    const removeButton = document.createElement("button");
    removeButton.className = "remove-item";
    removeButton.textContent = "×";
    removeButton.dataset.index = index;
    controlsDiv.appendChild(removeButton);
    
    listItem.appendChild(controlsDiv);
    turnList.appendChild(listItem);
  });
  
  // Update turn counter
  const turnCounter = document.getElementById("turn-counter");
  if (turnOrder.length === 0) {
    turnCounter.textContent = "No characters in turn order";
  } else {
    const currentTurnName = currentTurnIndex >= 0 ? 
      turnOrder[currentTurnIndex].name : "No active turn";
    turnCounter.textContent = `Current Turn: ${currentTurnName}`;
  }
  
  // Update button states
  document.getElementById("next-turn").disabled = turnOrder.length === 0;
  document.getElementById("previous-turn").disabled = turnOrder.length === 0;
  document.getElementById("reset-turns").disabled = currentTurnIndex === -1;
}