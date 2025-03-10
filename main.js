import OBR from "@owlbear-rodeo/sdk";

const ID = "com.heolia.turn-system";
let turnOrder = [];
let currentTurnIndex = -1;
let metadata = {};
let lastUpdateTimestamp = Date.now(); // Track when we last updated the data

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
  OBR.room.onMetadataChange((newMetadata) => {
    console.log("onMetadataChange triggered");
    
    // Check if the metadata update is newer than our last local update
    const serverUpdateTimestamp = newMetadata[`${ID}/lastUpdate`] || 0;
    
    if (serverUpdateTimestamp > lastUpdateTimestamp) {
      console.log(`Accepting server update (timestamp: ${serverUpdateTimestamp} > local: ${lastUpdateTimestamp})`);
      
      // Update local turnOrder from metadata
      if (newMetadata[`${ID}/turnOrder`]) {
        const newTurnOrder = newMetadata[`${ID}/turnOrder`];
        console.log(`onMetadataChange: New turnOrder from metadata, length: ${newTurnOrder.length}`);
        
        // Check if it's different than our current turnOrder
        const currentLength = turnOrder.length;
        turnOrder = newTurnOrder;
        console.log(`onMetadataChange: Updated local turnOrder, old length: ${currentLength}, new length: ${turnOrder.length}`);
      }
      
      if (newMetadata[`${ID}/currentTurnIndex`] !== undefined) {
        currentTurnIndex = newMetadata[`${ID}/currentTurnIndex`];
      }
      
      // Update our lastUpdateTimestamp to match the server
      lastUpdateTimestamp = serverUpdateTimestamp;
      
      // Update the UI to reflect changes
      updateUI();
    } else {
      console.log(`Ignoring server update (timestamp: ${serverUpdateTimestamp} <= local: ${lastUpdateTimestamp})`);
    }
    
    // Store the metadata for future reference
    metadata = newMetadata;
  });
  
  // Listen for item deletion to remove from turn order
  OBR.scene.items.onChange((items) => {
    const sceneIds = new Set(items.map(item => item.id));
    // Check if any items in turn order were deleted from the scene
    if (turnOrder.some(entry => !sceneIds.has(entry.id) && entry.id !== undefined)) {
      // Filter out deleted items (but keep invocations that don't have an ID)
      turnOrder = turnOrder.filter(entry => entry.id === undefined || sceneIds.has(entry.id));
      // Save updated turn order
      saveTurnOrder();
      // Update the UI
      updateUI();
    }
  });
  
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
      console.log(`Attempting to remove item at index ${index}`);
      console.log(`Character name: ${turnOrder[index]?.name}`);
      removeFromTurnOrder(index);
    }
  });
  // Set up button click handlers
  document.getElementById("add-selected").addEventListener("click", addSelectedItems);
  document.getElementById("next-turn").addEventListener("click", nextTurn);
  document.getElementById("previous-turn").addEventListener("click", previousTurn);
  document.getElementById("reset-turns").addEventListener("click", resetTurns);
}

// Add selected items to turn order
async function addSelectedItems() {
  const selectedItems = await OBR.player.getSelection();
  addItemsToTurnOrder(selectedItems);
}

// Set up context menu for adding characters to turn order
function setupContextMenu() {
  // Create the "Add to Turn Order" context menu item
  OBR.contextMenu.create({
    id: `${ID}/add-to-turn-order`,
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
      // Add all selected items to turn order normally
      addItemsToTurnOrder(context.items);
    }
  });
  
  // Create the "Add as Invocation" context menu item as a separate menu
  OBR.contextMenu.create({
    id: `${ID}/add-as-invocation`,
    icons: [
      {
        icon: "/turn.svg",
        label: "Add as Invocation",
        filter: {
          every: [
            { key: "layer", value: "CHARACTER" },
            { key: "type", value: "IMAGE" }
          ]
        }
      }
    ],
    onClick: (context) => {
      // Add as invocation after current character
      addAsInvocation(context.items);
    }
  });
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
      image: item.image?.url,
      isInvocation: false
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

// Add selected items as invocations after the current character
function addAsInvocation(items) {
  // Only proceed if there's an active turn
  if (currentTurnIndex < 0 || currentTurnIndex >= turnOrder.length) {
    OBR.notification.show("Cannot add invocation: No active character turn", "ERROR");
    return;
  }
  
  // Get the initiative value of the current character
  const currentInitiative = turnOrder[currentTurnIndex].initiative;
  
  // Filter items to only include characters not already in turn order
  const newInvocations = items
    .filter(item => item.layer === "CHARACTER")
    .filter(item => !turnOrder.some(entry => entry.id === item.id))
    .map(item => ({
      id: item.id,
      name: item.text?.plainText || item.name || "Unknown",
      initiative: currentInitiative, // Same as current character's initiative
      image: item.image?.url,
      isInvocation: true // Mark as an invocation
    }));
  
  if (newInvocations.length === 0) {
    return;
  }
  
  // Find the index where to insert the invocations
  let insertIndex = currentTurnIndex + 1;
  
  // Insert the invocations after any characters with the same initiative as the current character
  while (
    insertIndex < turnOrder.length && 
    turnOrder[insertIndex].initiative === currentInitiative
  ) {
    insertIndex++;
  }
  
  // Insert the invocations at the calculated index
  turnOrder.splice(insertIndex, 0, ...newInvocations);
  
  // If we inserted before the current turn index, update it
  if (insertIndex <= currentTurnIndex) {
    currentTurnIndex += newInvocations.length;
    saveCurrentTurnIndex();
  }
  
  // Save the updated turn order
  saveTurnOrder();
  
  // Update the UI
  updateUI();
  
  // Show success notification
  if (newInvocations.length === 1) {
    OBR.notification.show(`Added ${newInvocations[0].name} as invocation`, "SUCCESS");
  } else {
    OBR.notification.show(`Added ${newInvocations.length} invocations`, "SUCCESS");
  }
}

// Move an entry up in initiative order (lower number)
function moveUp(index) {
  if (index > 0) {
    // Store current initiative values
    const currentInitiative = turnOrder[index].initiative;
    const prevInitiative = turnOrder[index - 1].initiative;
    
    // Lower the initiative value (better)
    turnOrder[index].initiative = prevInitiative - 1;
    
    // Sort by initiative ascending (lower numbers first)
    turnOrder.sort((a, b) => a.initiative - b.initiative);
    saveTurnOrder();
    updateUI();
  }
}

// Move an entry down in initiative order (higher number)
function moveDown(index) {
  if (index < turnOrder.length - 1) {
    // Store current initiative values
    const currentInitiative = turnOrder[index].initiative;
    const nextInitiative = turnOrder[index + 1].initiative;
    
    // Increase the initiative value (worse)
    turnOrder[index].initiative = nextInitiative + 1;
    
    // Sort by initiative ascending (lower numbers first)
    turnOrder.sort((a, b) => a.initiative - b.initiative);
    saveTurnOrder();
    updateUI();
  }
}

// Remove an entry from the turn order
function removeFromTurnOrder(index) {
  console.log(`removeFromTurnOrder: Before removal - turnOrder length: ${turnOrder.length}`);
  console.log(`removeFromTurnOrder: Removing item at index ${index}: ${turnOrder[index]?.name}`);
  
  // Adjust currentTurnIndex if removing an entry before it
  if (index < currentTurnIndex) {
    currentTurnIndex--;
  } 
  // Or if removing the current entry
  else if (index === currentTurnIndex) {
    // If it's the last entry, go to the previous one
    if (currentTurnIndex === turnOrder.length - 1) {
      currentTurnIndex--;
    }
    // Otherwise, stay on the same index (which will be the next entry)
  }
  
  // Remove the entry
  turnOrder.splice(index, 1);
  console.log(`removeFromTurnOrder: After removal - turnOrder length: ${turnOrder.length}`);
  
  // Ensure currentTurnIndex is valid
  if (turnOrder.length === 0) {
    currentTurnIndex = -1;
  } else if (currentTurnIndex >= turnOrder.length) {
    currentTurnIndex = turnOrder.length - 1;
  }
  
  saveTurnOrder();
  saveCurrentTurnIndex();
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
    if (currentItem.id) {
      await OBR.scene.items.updateItems([{
        id: currentItem.id,
        border: {
          width: 5,
          color: "#FF9900"
        }
      }]);
    }
  }
}

// Save the turn order to room metadata
function saveTurnOrder() {
  console.log(`saveTurnOrder: Saving turnOrder with length: ${turnOrder.length}`);
  lastUpdateTimestamp = Date.now();
  OBR.room.setMetadata({
    [`${ID}/turnOrder`]: turnOrder,
    [`${ID}/lastUpdate`]: lastUpdateTimestamp
  });
}

// Save the current turn index to room metadata
function saveCurrentTurnIndex() {
  lastUpdateTimestamp = Date.now();
  OBR.room.setMetadata({
    [`${ID}/currentTurnIndex`]: currentTurnIndex,
    [`${ID}/lastUpdate`]: lastUpdateTimestamp
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
    console.log(`Creating button for ${entry.name} at index ${index}`);
    const listItem = document.createElement("li");
    listItem.className = "turn-item";
    if (index === currentTurnIndex) {
      listItem.classList.add("current-turn");
    }
    if (entry.isInvocation) {
      listItem.classList.add("invocation");
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