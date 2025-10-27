let recipes = [];
let folders = [];
let currentFolderId = null;
let isFolderEditMode = false;
let madeModalRecipe = '';
let currentTags = [];
let currentUser = null; // Global user tracker
let currentChatbotRecipe = null;
let chatbotModalElement = null; // To keep a reference to the modal DOM element
let loginModalInstance = null; // To store the Bootstrap modal instance
let localDB = null; // Initialize localDB as null
let infoConfirmModalInstance = null; // To store the Bootstrap modal instance
let addRecipeMethodModalInstance = null;
let currentAddRecipeMethod = null;
let recipeFormModalInstance = null; // for #recipeFormModal
let pasteTextModalInstance = null;  // for #pasteTextModal
let dedicatedRecipePhotoInput = null; // <<< ADD THIS DECLARATION HERE
let userSettingsModalInstance = null;
let currentWeeklyPlan = {};

document.addEventListener('DOMContentLoaded', () => {
    const loginModalElement = document.getElementById('loginModal');
    if (loginModalElement) {
        loginModalInstance = new bootstrap.Modal(loginModalElement);
    }
    const infoModalElement = document.getElementById('infoConfirmModal');
    if (infoModalElement) {
        infoConfirmModalInstance = new bootstrap.Modal(infoModalElement);
    }
    const addMethodModalElement = document.getElementById('addRecipeMethodModal');
    if (addMethodModalElement) {
        addRecipeMethodModalInstance = new bootstrap.Modal(addMethodModalElement);
    }
    const recipeFormModalElement = document.getElementById('recipeFormModal'); // Use new ID
    if (recipeFormModalElement) {
        recipeFormModalInstance = new bootstrap.Modal(recipeFormModalElement);
        recipeFormModalElement.addEventListener('hidden.bs.modal', () => {
            clearRecipeFormModal(); // Call a generic clear function
        });
    }
    const pasteModalEl = document.getElementById('pasteTextModal');
    if(pasteModalEl) pasteTextModalInstance = new bootstrap.Modal(pasteModalEl);
    const settingsModalElement = document.getElementById('userSettingsModal');
    if (settingsModalElement) {
        userSettingsModalInstance = new bootstrap.Modal(settingsModalElement);
    }
});

/**
 * Prepares and shows the recipe form modal.
 * Can be opened in different modes: 'new' (blank), 'review-ai' (populated with AI data),
 * or 'loading-ai' (shows a loading message).
 * @param {object|null} recipeDataToLoad - Recipe data to populate the form (used for 'review-ai').
 * @param {string} [mode='new'] - 'new', 'review-ai', or 'loading-ai'.
 */
function openRecipeFormModal(recipeDataToLoad = null, mode = 'new') {
    const modalElement = document.getElementById('recipeFormModal');
    if (!modalElement) {
        console.error("Recipe Form Modal element (#recipeFormModal) not found!");
        return;
    }
    const modalLabel = document.getElementById('recipeFormModalLabel');
    const saveButton = document.getElementById('saveRecipeFromModalBtn');
    const modalBody = document.getElementById('recipeFormModalBody');

    if (!modalLabel || !saveButton || !modalBody) {
        console.error("One or more essential elements of #recipeFormModal are missing!");
        return;
    }

    // Clear previous content specifically from modalBody to handle dynamic states
    modalBody.innerHTML = ''; // Clear previous form fields or loading messages

    if (mode === 'loading-ai') {
        modalLabel.innerHTML = '<i class="bi bi-images me-2"></i>Processing Photo with AI';
        saveButton.textContent = 'Processing...';
        saveButton.disabled = true;
        modalBody.innerHTML = `
            <div class="text-center p-4" style="min-height: 200px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <div class="spinner-border text-primary spinner-lg mb-3" role="status" style="width: 3rem; height: 3rem;">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <h5>Analyzing your recipe image...</h5>
                <p class="text-muted small">This may take a few moments, especially for larger images.</p>
            </div>
        `;
    } else if (mode === 'review-ai' && recipeDataToLoad) {
        modalLabel.innerHTML = '<i class="bi bi-magic me-2"></i>Review AI Generated Recipe';
        saveButton.textContent = 'Save This AI Recipe';
        saveButton.disabled = false;
        // clearRecipeFormModal will now be responsible for building the form HTML AND populating it
        clearRecipeFormModal(recipeDataToLoad); 
    } else { // Default to new manual entry ('new' mode)
        modalLabel.innerHTML = '<i class="bi bi-keyboard me-2"></i>Add Recipe Manually';
        saveButton.textContent = 'Save Recipe';
        saveButton.disabled = false;
        clearRecipeFormModal(null); // Clear and build form for new manual entry
    }

    // Initialize tag input only if the form structure is actually in the modal body
    if (mode === 'new' || mode === 'review-ai') {
        if (typeof initializeModalRecipeFormTagInput === "function") {
            initializeModalRecipeFormTagInput();
        } else {
            console.warn("initializeModalRecipeFormTagInput is not defined.");
        }
    }

    if (recipeFormModalInstance) {
        recipeFormModalInstance.show();
        // Only focus input if not in loading state and the input exists
        if (mode !== 'loading-ai') {
            const nameInput = document.getElementById('modalRecipeNameInput');
            if(nameInput) nameInput.focus();
        }
    } else {
        console.error("Recipe Form Modal instance not initialized.");
    }
}

// This function loads all available folders into the global 'folders' array.
async function loadFolders() {
    if (!currentUser) {
        // In the future, you could implement local-only folders here
        folders = [];
        return;
    }
    try {
        const snapshot = await db.collection('folders').where('uid', '==', currentUser.uid).orderBy('name').get();
        folders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Folders loaded:", folders);
    } catch (error) {
        console.error("Error loading folders:", error);
        folders = []; // Ensure folders is empty on error
    }
}

/**
 * Clears or populates the #recipeFormModal fields.
 * This function NOW also sets the initial HTML structure of the form in the modal body.
 * @param {object|null} recipeData - Recipe data to load into the form, or null to clear for new.
 */
function clearRecipeFormModal(recipeData = null) {
    const modalBody = document.getElementById('recipeFormModalBody');
    if (!modalBody) {
        console.error("clearRecipeFormModal: Modal body (#recipeFormModalBody) not found!");
        return;
    }

    // Inject the full form HTML structure into the modal body
    modalBody.innerHTML = `
        <div class="mb-3">
            <label for="modalRecipeNameInput" class="form-label fw-semibold">Recipe Name</label>
            <input type="text" class="form-control form-control-sm" id="modalRecipeNameInput" placeholder="Enter recipe name">
        </div>
        <div class="mb-3">
            <label class="form-label fw-semibold">Ingredients</label>
            <div id="modalIngredientsTable" class="mb-2">
                </div>
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="createIngredientRowForModal()">
                <i class="bi bi-plus-circle"></i> Add Ingredient Row
            </button>
        </div>
        <div class="mb-3">
            <label for="modalRecipeInstructionsInput" class="form-label fw-semibold">Instructions</label>
            <textarea class="form-control form-control-sm" id="modalRecipeInstructionsInput" rows="5" placeholder="Enter instructions"></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label fw-semibold">Tags</label>
            <div id="modalTagsContainer" class="form-control form-control-sm d-flex flex-wrap align-items-center gap-1 p-2 position-relative" style="min-height: 38px; background-color: #f8f9fa; border: 1px dashed #ced4da;">
                <span id="modalTagsPlaceholder" class="text-muted position-absolute small" style="left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none;">Add tags...</span>
            </div>
            <div class="input-group input-group-sm mt-2">
                <input type="text" id="modalTagInput" class="form-control" placeholder="Type a tag & press Enter">
                <button type="button" id="modalTagAddButton" class="btn btn-outline-secondary"><i class="bi bi-plus"></i> Add</button>
            </div>
        </div>
        <div id="recipeFormModalError" class="alert alert-danger small p-2" style="display:none;"></div>
    `;

    // Now get references to the newly created form elements to populate/clear them
    const nameInput = document.getElementById('modalRecipeNameInput');
    const ingredientsTable = document.getElementById('modalIngredientsTable'); // Already got, just for consistency
    const instructionsInput = document.getElementById('modalRecipeInstructionsInput');
    const tagInput = document.getElementById('modalTagInput');
    const errorDiv = document.getElementById('recipeFormModalError');

    if (nameInput) nameInput.value = recipeData?.name || '';
    if (instructionsInput) instructionsInput.value = recipeData?.instructions || '';
    if (errorDiv) errorDiv.style.display = 'none';

    currentModalTags = recipeData?.tags ? [...recipeData.tags] : [];
    if (typeof renderModalTags === "function") renderModalTags();

    if (tagInput) tagInput.value = '';

    // ingredientsTable was just cleared by modalBody.innerHTML. Now populate it.
    if (recipeData && recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
        recipeData.ingredients.forEach(ing => {
            if (typeof createIngredientRowForModal === "function") {
                createIngredientRowForModal(ing.name, ing.quantity, ing.unit);
            }
        });
    }
    // Always add one blank row if it's a new manual entry or if AI might return no ingredients
    if (!recipeData || !recipeData.ingredients || recipeData.ingredients.length === 0) {
        if (typeof createIngredientRowForModal === "function") {
             createIngredientRowForModal();
        }
    }
    // Re-initialize tag input listeners as the elements were recreated
    if (typeof initializeModalRecipeFormTagInput === "function") {
        initializeModalRecipeFormTagInput();
    }
}

function renderModalTags() {
    const tagsContainer = document.getElementById('modalTagsContainer');
    const placeholder = document.getElementById('modalTagsPlaceholder');
    if (!tagsContainer) {
        console.warn("renderModalTags: #modalTagsContainer not found.");
        return;
    }

    // Clear existing badges but preserve placeholder if it's a direct child
    let placeholderKept = null;
    if (placeholder && tagsContainer.contains(placeholder)) {
        placeholderKept = placeholder;
        tagsContainer.innerHTML = ''; // Clear
        tagsContainer.appendChild(placeholderKept); // Add placeholder back immediately
    } else {
        tagsContainer.innerHTML = ''; // Clear all
    }


    if (currentModalTags.length === 0) {
        if (placeholder) placeholder.style.display = 'block';
    } else {
        if (placeholder) placeholder.style.display = 'none';
    }

    currentModalTags.forEach(tag => {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'badge bg-primary text-white me-1 mb-1 py-1 px-2 small';
        tagBadge.textContent = tag;
        tagBadge.style.cursor = 'pointer';
        tagBadge.title = 'Click to remove tag';
        tagBadge.onclick = (e) => {
            e.stopPropagation();
            currentModalTags = currentModalTags.filter(t => t !== tag);
            renderModalTags();
        };
        tagsContainer.appendChild(tagBadge);
    });
}

/**
 * Handles keypress events for the tag input in the recipe form modal.
 * @param {Event} e - The keypress event.
 */
function handleModalTagInputKeypress(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const addButton = document.getElementById('modalTagAddButton');
        if (addButton) addButton.click();
    }
}

/**
 * Initializes the tag input functionality within the #recipeFormModal.
 */
function initializeModalRecipeFormTagInput() {
    const tagInput = document.getElementById('modalTagInput');
    const tagAddButton = document.getElementById('modalTagAddButton');

    if (tagInput && tagAddButton) {
        const addTagFromModalForm = () => {
            const value = tagInput.value.trim().toLowerCase();
            if (value && !currentModalTags.includes(value)) {
                currentModalTags.push(value);
                renderModalTags();
            }
            tagInput.value = '';
            tagInput.focus();
        };
        
        tagAddButton.onclick = addTagFromModalForm;
        // Remove previous listener before adding a new one to prevent duplication
        tagInput.removeEventListener('keypress', handleModalTagInputKeypress);
        tagInput.addEventListener('keypress', handleModalTagInputKeypress);
    } else {
        console.warn("Tag input elements for recipe form modal not found.");
    }
}


function createIngredientRowForModal(name = '', qty = '', unit = '') {
    const ingredientsTable = document.getElementById('modalIngredientsTable');
    if (!ingredientsTable) {
        console.error("createIngredientRowForModal: #modalIngredientsTable not found!");
        return;
    }

    const mainRowDiv = document.createElement('div');
    // mb-3 for spacing between full ingredient entries, or mb-2 if too much
    mainRowDiv.className = 'ingredient-form-entry border-bottom pb-2 mb-2'; 

    // Name Input (takes full width)
    const nameDiv = document.createElement('div');
    nameDiv.className = 'mb-1'; // Small margin below name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Ingredient Name';
    nameInput.className = 'form-control form-control-sm ingredient-name-input';
    nameInput.value = name;
    nameDiv.appendChild(nameInput);
    mainRowDiv.appendChild(nameDiv);

    // Row for Quantity, Unit, and Delete button
    const controlsRowDiv = document.createElement('div');
    controlsRowDiv.className = 'row g-2 align-items-center'; // g-2 for small gap

    // Quantity Column
    const qtyCol = document.createElement('div');
    qtyCol.className = 'col'; // Let Bootstrap decide based on content, or specify (e.g., col-4)
    const qtyInput = document.createElement('input');
    qtyInput.type = 'text'; // Allow "1/2", "to taste"
    qtyInput.placeholder = 'Qty';
    qtyInput.className = 'form-control form-control-sm ingredient-qty-input';
    qtyInput.value = qty;
    qtyCol.appendChild(qtyInput);
    controlsRowDiv.appendChild(qtyCol);

    // Unit Column
    const unitCol = document.createElement('div');
    unitCol.className = 'col'; // Let Bootstrap decide, or specify (e.g., col-5)
    const unitInput = document.createElement('input');
    unitInput.type = 'text';
    unitInput.placeholder = 'Unit';
    unitInput.className = 'form-control form-control-sm ingredient-unit-input';
    unitInput.value = unit;
    unitCol.appendChild(unitInput);
    controlsRowDiv.appendChild(unitCol);

    // Delete Button Column
    const deleteCol = document.createElement('div');
    deleteCol.className = 'col-auto'; // Take only needed width for the button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-outline-danger btn-sm py-0 px-1';
    deleteBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
    deleteBtn.title = 'Remove this ingredient';
    deleteBtn.onclick = () => mainRowDiv.remove(); // Remove the entire mainRowDiv
    deleteCol.appendChild(deleteBtn);
    controlsRowDiv.appendChild(deleteCol);

    mainRowDiv.appendChild(controlsRowDiv);
    ingredientsTable.appendChild(mainRowDiv);

    if (name === '' && qty === '' && unit === '') { // If it's a new blank row
        nameInput.focus();
    }
}

async function saveRecipeFromModal() {
    const name = document.getElementById('modalRecipeNameInput')?.value.trim();
    const instructions = document.getElementById('modalRecipeInstructionsInput')?.value.trim();
    const ingredients = [];
    const errorDiv = document.getElementById('recipeFormModalError');
    
    if(errorDiv) {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }

    // This logic is slightly different from your original, make sure it's correct for your new layout
    document.querySelectorAll('#modalIngredientsTable .ingredient-form-entry').forEach(row => {
        const ingName = row.querySelector('.ingredient-name-input')?.value.trim();
        const qty = row.querySelector('.ingredient-qty-input')?.value.trim();
        const unit = row.querySelector('.ingredient-unit-input')?.value.trim();
        if (ingName) {
            ingredients.push({ name: ingName, quantity: qty, unit: unit });
        }
    });

    if (!name) {
        const msg = "Recipe name cannot be empty.";
        if(errorDiv) { errorDiv.textContent = msg; errorDiv.style.display = 'block'; } else { alert(msg); }
        document.getElementById('modalRecipeNameInput')?.focus();
        return;
    }
    
    const recipeData = {
        name,
        ingredients,
        instructions: instructions || "", 
        tags: [...currentModalTags],   
        rating: 0,                   
    };

    // Use your generic save function which already adds the timestamp correctly
    const success = await saveNewRecipeToStorage(recipeData); 

    if (success) {
        if (recipeFormModalInstance) recipeFormModalInstance.hide(); 
    } else {
        const msg = "Failed to save recipe. Please try again.";
        if(errorDiv && (!errorDiv.textContent || errorDiv.style.display === 'none')) { 
            errorDiv.textContent = msg; 
            errorDiv.style.display = 'block'; 
        }
    }
}

function openAddRecipeMethodChoiceModal() {
    currentAddRecipeMethod = null; // Reset
    const previewArea = document.getElementById('addRecipeMethodPreview');
    if (previewArea) previewArea.style.display = 'none'; // Hide preview

    if (addRecipeMethodModalInstance) {
        addRecipeMethodModalInstance.show();
    } else {
        console.error("Add Recipe Method Modal not initialized.");
    }
}

function showPasteTextModal() {
    if (pasteTextModalInstance) {
        const textarea = document.getElementById('ocrTextPasteInputModal');
        const statusDiv = document.getElementById('pasteParseStatus');
        if (textarea) textarea.value = '';
        if (statusDiv) statusDiv.innerHTML = '';
        pasteTextModalInstance.show();
    } else {
        console.error("Paste Text Modal not initialized.");
    }
}

function toggleFolderEditMode() {
    isFolderEditMode = !isFolderEditMode; // Flip the state
    renderFolders(); // Re-render the list to show/hide icons and buttons
}

async function filterByFolder(event, folderId) {
    if (event) {
        event.preventDefault();
    }
    
    // Don't do anything if the same folder is clicked again
    if (currentFolderId === folderId) return;

    currentFolderId = folderId;
    console.log("Filtering by folder:", currentFolderId || "All Recipes");

    // --- NEW: Save the preference to Firebase ---
    if (currentUser) {
        try {
            const userRef = db.collection('users').doc(currentUser.uid);
            // Use dot notation in an .update() call to safely change a nested field
            await userRef.update({
                'preferences.lastSelectedFolderId': folderId
            });
            console.log(`Saved folder preference '${folderId}' to Firebase.`);
        } catch (error) {
            // This might fail if the 'preferences' object doesn't exist yet.
            // A .set() with merge is a safe fallback.
            if (error.code === 'not-found' || error.message.includes('No document to update')) {
                 const userRef = db.collection('users').doc(currentUser.uid);
                 await userRef.set({ preferences: { lastSelectedFolderId: folderId } }, { merge: true });
                 console.log(`Saved folder preference (with merge) '${folderId}' to Firebase.`);
            } else {
                 console.error("Error saving user folder preference:", error);
            }
        }
    }
    // --- END NEW ---

    // Re-render the UI
    renderFolders();
    applyAllRecipeFilters();

    // On mobile, close the sidebar after selection
    if (window.innerWidth < 992) {
        toggleSidebar();
    }
}

/**
 * Called when a user selects a method from the "Add Recipe Method Choice" modal.
 * It hides the choice modal and triggers the UI for the selected method.
 * @param {string} method - The chosen method: 'manual', 'photo', 'photo-of-food', 'paste', 'chefbot'.
 */
function selectAddRecipeMethod(method) {
    currentAddRecipeMethod = method;
    console.log("Selected add recipe method:", method);

    if (addRecipeMethodModalInstance && typeof addRecipeMethodModalInstance.hide === 'function') {
        addRecipeMethodModalInstance.hide();
    }

    switch (method) {
        case 'manual':
            console.log("Manual entry selected. Opening recipe form modal for new entry.");
            if (typeof openRecipeFormModal === "function") {
                openRecipeFormModal(null, 'new'); // Open blank form modal
            } else {
                console.error("openRecipeFormModal function is not defined.");
            }
            break;

        case 'photo': // For extracting recipe from photo of TEXT
        case 'photo-of-food': // For generating recipe from photo of FOOD
            console.log(`Photo method selected: ${method}. Triggering dedicated photo input.`);
            
            if (dedicatedRecipePhotoInput && dedicatedRecipePhotoInput.parentNode) {
                dedicatedRecipePhotoInput.remove(); // Clean up any previous input
            }
            
            dedicatedRecipePhotoInput = document.createElement('input');
            dedicatedRecipePhotoInput.type = 'file';
            dedicatedRecipePhotoInput.accept = 'image/*';
            
            if (navigator.userAgent.match(/Android/i) || navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
                dedicatedRecipePhotoInput.capture = 'environment'; // Prefer back camera on mobile
            }
            
            dedicatedRecipePhotoInput.style.display = 'none'; // Keep it hidden

            dedicatedRecipePhotoInput.onchange = (event) => {
                const resolvedPromptType = (method === 'photo-of-food') ? 'generate-from-food' : 'extract';
                
                if (typeof handleRecipePhoto === "function") {
                    // Always directFill to the review modal when initiated from method choice
                    handleRecipePhoto(event, true, resolvedPromptType); 
                } else {
                    console.error("handleRecipePhoto function is not defined!");
                }
                
                if (dedicatedRecipePhotoInput && dedicatedRecipePhotoInput.parentNode) {
                    dedicatedRecipePhotoInput.remove();
                }
                dedicatedRecipePhotoInput = null;
            };
            
            document.body.appendChild(dedicatedRecipePhotoInput); // Add to body to make it clickable
            dedicatedRecipePhotoInput.click(); // Programmatically click the hidden file input
            break;

        case 'paste':
            console.log("Paste method selected. Opening paste text modal.");
            if (typeof showPasteTextModal === "function") {
                showPasteTextModal(); // This function will show a modal for pasting text
            } else {
                console.error("showPasteTextModal function is not defined!");
            }
            break;

        case 'chefbot':
            console.log("Chef Bot selected for new recipe generation.");
            if (typeof showChatbotModal === "function") {
                showChatbotModal(); // This opens the general Chef Bot for new recipes
            } else {
                console.error("showChatbotModal function is not defined!");
            }
            break;

        default:
            console.error("Unknown recipe add method selected in selectAddRecipeMethod:", method);
    }
}

/**
 * Shows a generic modal for information or confirmation.
 * @param {string} title - The title of the modal.
 * @param {string} bodyContent - HTML or text content for the modal body.
 * @param {Array<Object>} buttons - Array of button objects, e.g., [{text: 'OK', class: 'btn-primary', onClick: () => {...}}]
 * If null or empty, a default "Close" button is shown.
 */
function showInfoConfirmModal(title, bodyContent, buttons = []) {
    if (!infoConfirmModalInstance) {
        console.error("Info/Confirm Modal instance not initialized!");
        alert(bodyContent); // Fallback to alert if modal isn't ready
        return;
    }

    const modalTitle = document.getElementById('infoConfirmModalLabel');
    const modalBody = document.getElementById('infoConfirmModalBody');
    const modalFooter = document.getElementById('infoConfirmModalFooter');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.innerHTML = bodyContent; // Use innerHTML to allow basic HTML in the message
    if (modalFooter) {
        modalFooter.innerHTML = ''; // Clear previous buttons

        if (buttons && buttons.length > 0) {
            buttons.forEach(btnConfig => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `btn ${btnConfig.class || 'btn-secondary'}`;
                button.innerHTML = btnConfig.text;
                if (btnConfig.dismiss) { // If true, button will dismiss the modal
                    button.setAttribute('data-bs-dismiss', 'modal');
                }
                button.onclick = () => {
                    if (btnConfig.onClick) {
                        btnConfig.onClick();
                    }
                    // Only auto-dismiss if not explicitly handled by onClick or if dismiss flag not set to false
                    if (btnConfig.autoClose !== false && !btnConfig.onClick && !btnConfig.dismiss) {
                         infoConfirmModalInstance.hide();
                    } else if (btnConfig.autoClose !== false && btnConfig.onClick && btnConfig.dismissOnClick !== false) {
                        // If there's an onClick, and dismissOnClick is not explicitly false, then hide.
                        infoConfirmModalInstance.hide();
                    }
                };
                modalFooter.appendChild(button);
            });
        } else {
            // Default close button if no buttons are provided
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'btn btn-secondary';
            closeButton.setAttribute('data-bs-dismiss', 'modal');
            closeButton.textContent = 'Close';
            modalFooter.appendChild(closeButton);
        }
    }
    infoConfirmModalInstance.show();
}

function initializeLocalDB() {
    if (!window.indexedDB) {
        console.warn("IndexedDB not supported by this browser. Local storage features will be limited.");
        return;
    }

    localDB = new Dexie("RecipeAppDB");
    // Increment the version number if you're changing the schema after users might have version 1
    // For development, you can clear your browser's IndexedDB for the site to start fresh with a new schema.
    // Or, handle upgrades: https://dexie.org/docs/Tutorial/Design#database-versioning
    localDB.version(5).stores({ // Increment version if 'shoppingList' store is new or changing structure
        recipes: '++localId, name, timestamp, *tags, folderId, chatHistory', // Add chatHistory
        history: '++localId, recipeName, timestamp, *tags',
        planning: '++localId, date, recipeLocalId, recipeName',
        shoppingList: '++id, name, ingredients' // NEW or UPDATED: for local shopping list
                                                // '++id' simple auto-incrementing key
                                                // 'name' could be a generic name like "localShoppingList"
                                                // 'ingredients' will be an array of ingredient objects
    }).upgrade(tx => {
        console.log("Upgrading RecipeAppDB to version 3, ensuring 'shoppingList' store is present/updated.");
        // If version 2 didn't have shoppingList or had a different structure,
        // you might need to handle that here. For adding a new table, this is often enough.
    });


    localDB.open().then(() => {
        console.log("RecipeAppDB (IndexedDB via Dexie) opened successfully with stores: recipes, history, planning.");
    }).catch(err => {
        console.error("Failed to open RecipeAppDB:", err.stack || err);
        localDB = null;
    });
}

// Call this when the script loads
initializeLocalDB();

// --- Helper function to generate simple local IDs ---
function generateLocalUUID() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- Login Modal View Management Functions ---
function showLoginModal() {
    if (loginModalInstance) {
        switchToInitialOptionsView(); // This now sets the title appropriately
        clearLoginErrorMessages();
        // Clear email input field when modal is freshly opened
        const loginEmailInput = document.getElementById('loginEmailInput');
        if (loginEmailInput) loginEmailInput.value = ''; 
        loginModalInstance.show();
    } else {
        console.error("Login modal instance not found!");
    }
}


function hideLoginModal() {
    if (loginModalInstance) {
        loginModalInstance.hide();
    }
}

function clearLoginErrorMessages() {
    const loginErrorDiv = document.getElementById('loginErrorMessage');
    const signUpErrorDiv = document.getElementById('signUpErrorMessage');
    if (loginErrorDiv) loginErrorDiv.style.display = 'none';
    if (signUpErrorDiv) signUpErrorDiv.style.display = 'none';
}

function displayLoginError(view, message) {
    let errorDivId = '';
    if (view === 'login') errorDivId = 'loginErrorMessage';
    else if (view === 'signup') errorDivId = 'signUpErrorMessage';
    
    const errorDiv = document.getElementById(errorDivId);
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function switchToInitialOptionsView() {
    document.getElementById('initialLoginOptionsView').style.display = 'block';
    document.getElementById('passwordLoginView').style.display = 'none';
    document.getElementById('signUpView').style.display = 'none';
    document.getElementById('loginModalLabel').textContent = 'Sign in or create account'; // CHANGED
    clearLoginErrorMessages();
}


function switchToPasswordLoginView(email = '') {
    document.getElementById('initialLoginOptionsView').style.display = 'none';
    document.getElementById('passwordLoginView').style.display = 'block';
    document.getElementById('signUpView').style.display = 'none';
    
    const emailInput = document.getElementById('emailForPasswordLogin');
    const passwordLoginTitle = document.getElementById('passwordLoginTitle');

    if (email) {
        emailInput.value = email;
        emailInput.readOnly = true; // Make it readonly if prefilled from a trusted step
        if(passwordLoginTitle) passwordLoginTitle.textContent = `Enter password for ${email}`;
    } else {
        emailInput.value = ''; // Clear if no email passed
        emailInput.readOnly = false;
        if(passwordLoginTitle) passwordLoginTitle.textContent = 'Log In with Email & Password';
    }
    document.getElementById('passwordForLogin').value = ''; // Clear password field
    document.getElementById('passwordForLogin').focus(); // Focus password field
    clearLoginErrorMessages();
}

function switchToSignUpView() {
    document.getElementById('initialLoginOptionsView').style.display = 'none';
    document.getElementById('passwordLoginView').style.display = 'none';
    document.getElementById('signUpView').style.display = 'block';
    document.getElementById('loginModalLabel').textContent = 'Create Account';
    
    const initialEmail = document.getElementById('loginEmailInput').value;
    const signUpEmailInput = document.getElementById('emailForSignUp');
    if (initialEmail) {
        signUpEmailInput.value = initialEmail;
        signUpEmailInput.readOnly = true; // Make it readonly if prefilled
    } else {
        signUpEmailInput.value = '';
        signUpEmailInput.readOnly = false;
    }
    document.getElementById('passwordForSignUp').value = '';
    document.getElementById('confirmPasswordForSignUp').value = '';
    clearLoginErrorMessages();
    if (!initialEmail) {
        signUpEmailInput.focus();
    } else {
        document.getElementById('passwordForSignUp').focus();
    }
}

function renderTags() {
  const tagsContainer = document.getElementById('tagsContainer');
  const placeholder = document.getElementById('tagsPlaceholder');
  if (!tagsContainer) return;

  tagsContainer.innerHTML = '';

  if (currentTags.length === 0) {
    if (placeholder) placeholder.style.display = 'block';
  } else {
    if (placeholder) placeholder.style.display = 'none';
  }

  currentTags.forEach(tag => {
    const tagBadge = document.createElement('span');
    tagBadge.className = 'badge bg-primary text-white me-1';
    tagBadge.textContent = tag;

    // Allow removing tags on click
    tagBadge.onclick = () => {
      currentTags = currentTags.filter(t => t !== tag);
      renderTags();
    };

    tagsContainer.appendChild(tagBadge);
  });
}

function clearAllPlanning(button) {
  if (button.parentElement.querySelector('.confirm-clear')) return;

  button.style.display = 'none';

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-clear d-flex gap-2 align-items-center';

  const confirmText = document.createElement('span');
  confirmText.textContent = 'Delete ALL planned meals?';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-danger';
  yesBtn.textContent = 'Yes';
  yesBtn.onclick = () => {
    db.collection("planning")
    .where('uid', '==', currentUser.uid)
    .get()
    .then(snapshot => {
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      return batch.commit();
    }).then(() => {
      console.log("✅ All planning cleared.");
      showPlanning(); // ✅ FULL re-render the Planning screen
    }).catch(err => {
      console.error("❌ Error clearing planning:", err);
      confirmArea.remove();
      button.style.display = '';
    });
  };

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-dark';
  noBtn.textContent = 'No';
  noBtn.onclick = () => {
    confirmArea.remove();
    button.style.display = '';
  };

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);

  button.parentElement.appendChild(confirmArea);
}

async function loadRecipes() {
  const res = await fetch('recipes.json');
  recipes = await res.json();
  showRecipeFilter();
}

function showRecipeFilter() {
    // If using page titles and active nav states from responsive navigation:
    updatePageTitle("Recipes");
    setActiveNavButton("recipes");

    const view = document.getElementById('mainView');
    if (!view) {
        console.error("mainView element not found for showRecipeFilter");
        return;
    }
    view.className = 'section-recipes container py-3';

    view.innerHTML = `
        <div class="recipe-header-bar d-flex align-items-center gap-2 mb-3">
            <!-- Pancake/Menu Icon to toggle sidebar -->
            <button class="btn btn-outline-secondary d-lg-none" type="button" onclick="toggleSidebar()" title="Toggle Folders">
                <i class="bi bi-list fs-4"></i>
            </button>

            <!-- Unified Search Bar -->
            <div class="search-bar-wrapper flex-grow-1 position-relative">
                <i class="bi bi-search position-absolute"></i>
                <input type="text" class="form-control form-control-lg" id="unifiedSearchInput" placeholder="Search my recipes..." oninput="applyAllRecipeFilters()">
            </div>

            <!-- Add Recipe Icon -->
            <button class="btn btn-primary" type="button" onclick="openAddRecipeMethodChoiceModal()" title="Add New Recipe">
                <i class="bi bi-plus-lg fs-4"></i>
            </button>
        </div>

        <div id="recipeResults"></div>
    `;

    if (typeof renderSortOptions === "function") {
        renderSortOptions();
    } else {
        console.error("renderSortOptions function is not defined!");
    }

    applyAllRecipeFilters();
}

/**
 * Updates the text content of the #currentPageTitle element in the #topBar.
 * @param {string} title - The new title to display.
 */
function updatePageTitle(title) {
    const titleElement = document.getElementById('currentPageTitle');
    if (titleElement) {
        titleElement.textContent = title;
    } else {
        console.warn("Element with ID 'currentPageTitle' not found in the DOM.");
    }
}

function clearAllRecipeFilters() {
    const nameSearch = document.getElementById('nameSearch');
    const ingredientSearch = document.getElementById('recipeSearch'); // Uses 'recipeSearch' for ingredients
    const tagSearch = document.getElementById('tagSearch');

    if (nameSearch) nameSearch.value = '';
    if (ingredientSearch) ingredientSearch.value = '';
    if (tagSearch) tagSearch.value = '';

    applyAllRecipeFilters(); // Re-apply with empty filters to show all recipes
}

async function handlePastedRecipeTextFromModal() {
    const textarea = document.getElementById('ocrTextPasteInputModal');
    const statusDiv = document.getElementById('pasteParseStatus');
    const parseButton = document.querySelector('#pasteTextModal .btn-primary'); // Find the button to disable it

    if (!textarea || !statusDiv || !parseButton) {
        console.error("Required modal elements for pasting text not found!");
        return;
    }

    const text = textarea.value.trim();
    if (!text) {
        statusDiv.textContent = "Please paste recipe text first.";
        statusDiv.className = "form-text small mt-2 text-danger";
        return;
    }

    // --- Update UI to show loading state ---
    statusDiv.className = "form-text small mt-2 text-info";
    statusDiv.innerHTML = '🤖 Asking Chef Bot to parse the recipe... <span class="spinner-border spinner-border-sm"></span>';
    parseButton.disabled = true;

    try {
        // --- Call the new Netlify function ---
        const response = await fetch("/.netlify/functions/parse-recipe-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipeText: text })
        });

        const parsedRecipeData = await response.json();

        if (!response.ok || parsedRecipeData.error) {
            throw new Error(parsedRecipeData.error || `Failed to parse text (status ${response.status})`);
        }

        console.log("AI parsed recipe data:", parsedRecipeData);
        
        if (pasteTextModalInstance) {
            pasteTextModalInstance.hide();
        }
        
        // Open the review modal with the AI-parsed data
        openRecipeFormModal(parsedRecipeData, 'review-ai');

    } catch (error) {
        console.error("Error parsing pasted recipe text with AI:", error);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.className = "form-text small mt-2 text-danger";
    } finally {
        // --- Restore UI after completion or error ---
        parseButton.disabled = false;
    }
}

function normalizeFractions(text) {
  return text
    .replace(/½/g, '1/2')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅕/g, '1/5')
    .replace(/⅖/g, '2/5')
    .replace(/⅗/g, '3/5')
    .replace(/⅘/g, '4/5')
    .replace(/⅙/g, '1/6')
    .replace(/⅚/g, '5/6')
    .replace(/⅛/g, '1/8')
    .replace(/⅜/g, '3/8')
    .replace(/⅝/g, '5/8')
    .replace(/⅞/g, '7/8');
}

function applyAllRecipeFilters() {
    const searchInput = document.getElementById('unifiedSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const searchTermsArray = searchTerm.split(' ').filter(term => term.length > 0);

    let filteredList = [...recipes]; 

    if (currentFolderId) {
        // If a specific folder is selected, start with only recipes from that folder
        filteredList = recipes.filter(recipe => recipe.folderId === currentFolderId);
    } else {
        // Otherwise, start with all recipes
        filteredList = [...recipes];
    }

    if (searchTermsArray.length > 0) {
        filteredList = filteredList.filter(recipe => {
            const searchableContent = [
                recipe.name || "",
                ...(recipe.ingredients || []).map(ing => ing.name || ""),
                ...(recipe.tags || [])
            ].join(' ').toLowerCase();
            return searchTermsArray.every(term => searchableContent.includes(term));
        });
    }

    if (currentSortOrder === 'newest') {
        filteredList.sort((a, b) => {
            const getTime = (timestamp) => {
                if (!timestamp) return 0;
                return timestamp.toDate ? timestamp.toDate().getTime() : new Date(timestamp).getTime();
            };
            return getTime(b.timestamp) - getTime(a.timestamp);
        });
    } else if (currentSortOrder === 'modified') {
        filteredList.sort((a, b) => {
            const getModifiedTime = (recipe) => {
                const timestamp = recipe.lastModified || recipe.timestamp;
                if (!timestamp) return 0;
                return timestamp.toDate ? timestamp.toDate().getTime() : new Date(timestamp).getTime();
            };
            return getModifiedTime(b) - getModifiedTime(a);
        });
    } else if (currentSortOrder === 'rating') { // --- ADD THIS BLOCK ---
        // Sort by rating, highest first. Recipes without a rating are treated as 0.
        filteredList.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
     else if (currentSortOrder === 'all') {
        filteredList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    
    const displayOptions = {
        highlightNameTerm: searchTerm,
        highlightIngredients: searchTermsArray,
        highlightTags: searchTermsArray
    };

    displayRecipes(filteredList, 'recipeResults', displayOptions);
}

function filterRecipesByTag() {
  const search = document.getElementById('tagSearch').value.trim().toLowerCase();
  const tagTerms = search.split(',').map(t => t.trim()).filter(Boolean);

  if (tagTerms.length === 0) {
    displayRecipes(recipes);
    return;
  }

  const filtered = recipes.filter(recipe => {
    if (!recipe.tags) return false;

    const recipeTags = recipe.tags.map(tag => tag.toLowerCase());

    // ✅ ALL search tags must match at least once
    return tagTerms.every(term =>
      recipeTags.some(tag => tag.startsWith(term))
    );
  });

  displayRecipes(filtered, 'recipeResults', { highlightTags: tagTerms });
}

function createHighlightRegex(term) {
    if (!term) return null;
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(${escapedTerm})`, 'gi');
}

async function handlePastedRecipeTextFromModal() {
    const textarea = document.getElementById('ocrTextPasteInputModal');
    const statusDiv = document.getElementById('pasteParseStatus');
    const parseButton = document.querySelector('#pasteTextModal .btn-primary'); // Find the button to disable it

    if (!textarea || !statusDiv || !parseButton) {
        console.error("Required modal elements for pasting text not found!");
        return;
    }

    const text = textarea.value.trim();
    if (!text) {
        statusDiv.textContent = "Please paste recipe text first.";
        statusDiv.className = "form-text small mt-2 text-danger";
        return;
    }

    // --- Update UI to show loading state ---
    statusDiv.className = "form-text small mt-2 text-info";
    statusDiv.innerHTML = '🤖 Asking Chef Bot to parse the recipe... <span class="spinner-border spinner-border-sm"></span>';
    parseButton.disabled = true;

    try {
        // --- Call the new Netlify function ---
        const response = await fetch("/.netlify/functions/parse-recipe-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipeText: text })
        });

        const parsedRecipeData = await response.json();

        if (!response.ok || parsedRecipeData.error) {
            throw new Error(parsedRecipeData.error || `Failed to parse text (status ${response.status})`);
        }

        console.log("AI parsed recipe data:", parsedRecipeData);
        
        if (pasteTextModalInstance) {
            pasteTextModalInstance.hide();
        }
        
        // Open the review modal with the AI-parsed data
        openRecipeFormModal(parsedRecipeData, 'review-ai');

    } catch (error) {
        console.error("Error parsing pasted recipe text with AI:", error);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.className = "form-text small mt-2 text-danger";
    } finally {
        // --- Restore UI after completion or error ---
        parseButton.disabled = false;
    }
}

/**
 * Handles the recipe photo upload, preprocessing, AI call, and populates the review modal.
 * @param {Event} event - The file input change event.
 * @param {boolean} directFill - Should always be true for this new modal flow.
 * @param {string} [promptType='extract'] - 'extract' for text from recipe image, 'generate-from-food' for recipe from dish photo.
 */
async function handleRecipePhoto(event, directFill = true, promptType = 'extract') { // directFill is effectively always true
    console.log("--- handleRecipePhoto Invoked ---");
    console.log("Parameters - directFill:", directFill, "| Prompt Type:", promptType);

    const file = event.target.files[0];
    if (!file) {
        console.log("handleRecipePhoto: No file selected.");
        return;
    }

    console.log("File details - Name:", file.name, "| Size:", file.size, "| Type:", file.type);

    // Immediately open the Recipe Form Modal in a loading state.
    if (typeof openRecipeFormModal !== "function") {
        console.error("openRecipeFormModal is not defined! Cannot proceed with photo processing workflow.");
        alert("An error occurred setting up the recipe form. Please try again.");
        return;
    }
    openRecipeFormModal(null, 'loading-ai'); // Pass null for data, and 'loading-ai' mode

    // Get references to modal elements (assuming openRecipeFormModal has shown the modal and these IDs exist)
    // It's safer to get these *after* openRecipeFormModal has potentially rendered its initial 'loading-ai' state.
    // However, for updating the body, we need it now.
    const modalBodyForLoading = document.getElementById('recipeFormModalBody');
    const saveRecipeBtnModal = document.getElementById('saveRecipeFromModalBtn');


    const reader = new FileReader();

    reader.onerror = (error) => {
        console.error("FileReader error:", error);
        if (modalBodyForLoading) {
            modalBodyForLoading.innerHTML = '<p class="alert alert-danger text-center">Error reading the selected file. Please close this and try again.</p>';
        } else {
            alert("Error reading the selected file. Please try again.");
        }
        if (saveRecipeBtnModal) saveRecipeBtnModal.disabled = false; // Re-enable if stuck in loading
    };

    reader.onload = function (e) {
        const originalImgSrc = e.target.result;
        console.log("FileReader success. originalImgSrc length:", originalImgSrc ? originalImgSrc.length : "N/A");

        if (!originalImgSrc || originalImgSrc.length === 0) {
            console.error("handleRecipePhoto: FileReader result (originalImgSrc) is empty.");
            if (modalBodyForLoading) modalBodyForLoading.innerHTML = '<p class="alert alert-danger text-center">Error: Could not read image data from the file. Please close and try again.</p>';
            else alert("Error: Could not read image data from the file.");
            if (saveRecipeBtnModal) saveRecipeBtnModal.disabled = false;
            return;
        }
        
        // The modal is already showing "Analyzing your recipe image..." from openRecipeFormModal('loading-ai')
        // So, we don't need to update modalBodyForLoading again here unless the message needs to change.

        const imgForPreprocessing = document.createElement('img');

        imgForPreprocessing.onerror = () => {
            console.error("Error loading image into temporary img element for preprocessing.");
            if (modalBodyForLoading) modalBodyForLoading.innerHTML = '<p class="alert alert-danger text-center">Could not load image for processing. Please try a different image or format. Close and try again.</p>';
            else alert("Could not load image for processing.");
            if (saveRecipeBtnModal) saveRecipeBtnModal.disabled = false;
        };

        imgForPreprocessing.onload = async () => {
            console.log("--- Temporary image loaded. Dimensions:", imgForPreprocessing.naturalWidth, "x", imgForPreprocessing.naturalHeight);
            // The loading message is already in modalBody.

            let processedDataUrl;
            try {
                console.log("handleRecipePhoto: Attempting to preprocess image.");
                processedDataUrl = preprocessImage(imgForPreprocessing);
                if (!processedDataUrl || !processedDataUrl.includes(',')) {
                    throw new Error("Preprocessing returned an invalid data URL.");
                }
                console.log("Processed image data URL length:", processedDataUrl.length);
            } catch (preprocessError) {
                console.error("Error during image preprocessing:", preprocessError);
                if (modalBodyForLoading) modalBodyForLoading.innerHTML = `<p class="alert alert-danger text-center">Error preprocessing image: ${escapeHtml(preprocessError.message)}. Close and try again.</p>`;
                else alert(`Error preprocessing image: ${preprocessError.message}`);
                if (saveRecipeBtnModal) saveRecipeBtnModal.disabled = false; // Re-enable save if it was disabled
                return;
            }
            
            const base64ImageData = processedDataUrl.split(',')[1];
            const payload = {
                image: base64ImageData,
                mimeType: file.type || 'image/jpeg',
                promptType: promptType
            };
            console.log("Payload ready. Base64 length (approx):", base64ImageData.length, "PromptType:", promptType);

            try {
                console.log("Fetching /.netlify/functions/process-recipe-image");
                const response = await fetch("/.netlify/functions/process-recipe-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                
                const responseText = await response.text();
                console.log("Raw response from Netlify function (first 500 chars):", responseText.substring(0, 500));

                if (!response.ok) {
                    let errorData = { error: `Server error ${response.status}.` };
                    try { errorData = JSON.parse(responseText); } catch (e) { 
                        console.warn("Could not parse server error response as JSON.");
                        errorData.details = responseText.substring(0,200); // Add raw beginning of response
                    }
                    throw new Error(errorData.error || `Failed to process image with AI.`);
                }

                const recipeData = JSON.parse(responseText);
                if (recipeData.error) {
                    throw new Error(recipeData.error);
                }

                console.log("AI Extracted/Generated Recipe Data:", recipeData);
                
                // Re-call openRecipeFormModal to switch from 'loading-ai' to 'review-ai' mode
                // This will internally call clearRecipeFormModal to build the form and populate it.
                openRecipeFormModal(recipeData, 'review-ai');
                // Focus is handled by openRecipeFormModal in 'review-ai' mode

            } catch (err) {
                console.error("Error during fetch to Netlify function or processing AI response:", err);
                const modalBody = document.getElementById('recipeFormModalBody'); // Re-fetch in case it was cleared
                if (modalBody) modalBody.innerHTML = `<div class="alert alert-danger text-center"><strong>AI Processing Error:</strong><br>${escapeHtml(err.message)}<br><small>Please close and try a different image or prompt.</small></div>`;
                else alert(`AI Processing Error: ${err.message}`);
                const saveBtnModal = document.getElementById('saveRecipeFromModalBtn');
                if(saveBtnModal) saveBtnModal.disabled = true; // Keep save disabled on final error
            }
            console.log("--- handleRecipePhoto DEBUG END (img.onload finished) ---");
        }; 
        imgForPreprocessing.src = originalImgSrc;
        console.log("handleRecipePhoto: imgForPreprocessing.src assigned. Waiting for its onload or onerror event.");
    }; 
    reader.readAsDataURL(file);
}

function generateStructuredOcrTemplate(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let title = '';
  const ingredients = [];
  const instructions = [];

  let inIngredients = false;
  let inInstructions = false;

  lines.forEach((line, idx) => {
    const lower = line.toLowerCase();

    if (!title) {
      title = line;
      return;
    }

    if (lower.includes('ingredient')) {
      inIngredients = true;
      inInstructions = false;
      return;
    }

    if (lower.includes('instruction') || lower.includes('method') || lower.includes('directions')) {
      inIngredients = false;
      inInstructions = true;
      return;
    }

    if (inIngredients) {
      ingredients.push(line);
    } else if (inInstructions) {
      instructions.push(line);
    }
  });

  return [
    '📛 RECIPE NAME',
    '====================',
    title,
    '',
    '🧂 INGREDIENTS',
    '====================',
    ingredients.join('\n') || '(none found)',
    '',
    '📝 INSTRUCTIONS',
    '====================',
    instructions.join('\n') || '(none found)'
  ].join('\n');
  
}

function deleteHistoryEntry(entryId, cardElement) {
  if (!confirm("Are you sure you want to delete this history entry?")) return;

  db.collection('history').doc(entryId).delete()
    .then(() => {
      console.log('✅ History entry deleted:', entryId);
      cardElement.remove(); // Instantly remove from the view
    })
    .catch((err) => {
      console.error('❌ Failed to delete history entry:', err);
      alert('Failed to delete history entry.');
    });
}

/**
 * Called when a "Mark as Made" button on a recipe card is clicked.
 * It opens an inline form for notes and date.
 * @param {object} recipeDataFromCard - The full recipe object from the card.
 * @param {HTMLElement} buttonElement - The button element that was clicked.
 */
function markAsMade(recipeDataFromCard, buttonElement) {
    // Log the data received from the recipe card
    console.log("markAsMade clicked for recipe:", recipeDataFromCard.name, "ID:", recipeDataFromCard.id);

    const card = buttonElement.closest('.recipe-card'); // Ensure your recipe cards have class 'recipe-card'
    if (!card) {
        console.error("Could not find parent card for 'Mark as Made' button.");
        return;
    }
    // Prevent multiple forms on the same card
    if (card.querySelector('.mark-made-form')) {
        console.log("Mark as Made form already open for this recipe.");
        return;
    }

    const form = document.createElement('div');
    form.className = 'mark-made-form mt-3 p-3 border rounded bg-light-subtle';

    const textarea = document.createElement('textarea');
    textarea.className = 'form-control mb-2';
    textarea.rows = 2;
    textarea.placeholder = 'Optional notes about when you made it...';

    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Made on date:';
    dateLabel.className = 'form-label mb-0 me-2 fw-semibold small'; // Added me-2 for spacing
    dateLabel.style.whiteSpace = 'nowrap';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'form-control form-control-sm d-inline-block';
    dateInput.style.maxWidth = '150px';
    dateInput.value = new Date().toISOString().split('T')[0]; // Default to today

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-success btn-sm'; // Using solid success button
    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Save to History';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-outline-secondary btn-sm';
    cancelBtn.innerHTML = '<i class="bi bi-x-lg"></i> Cancel';

    const controls = document.createElement('div');
    controls.className = 'd-flex align-items-center gap-2 flex-wrap mt-2'; // flex-wrap for responsiveness
    controls.appendChild(dateLabel);
    controls.appendChild(dateInput);
    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
    
    saveBtn.onclick = async () => { // Made async for db operations
        const notes = textarea.value.trim();
        const madeOnDateString = dateInput.value;

        if (!madeOnDateString) {
            alert("Please select a date for when this recipe was made.");
            dateInput.focus();
            return;
        }

        // Ensure date is treated as local, then get start of day in UTC for consistent ISO string for timestamp
        const localDate = new Date(madeOnDateString + 'T00:00:00');
        const timestampForHistory = localDate.toISOString(); // This is the "date made"

        // Extract data from the recipeDataFromCard object
        const actualRecipeName = recipeDataFromCard.name;
        const originalRecipeID = recipeDataFromCard.id; // This is localId or FirestoreId
        const recipeTagsToSave = recipeDataFromCard.tags || [];

        let nameToSave;
        if (actualRecipeName && typeof actualRecipeName === 'string' && actualRecipeName.trim() !== "") {
            nameToSave = actualRecipeName.trim();
        } else {
            nameToSave = "Untitled Recipe Event";
            console.warn("Recipe name was invalid or empty for history, defaulting to:", nameToSave, "Original value was:", actualRecipeName);
        }

        const historyEntry = {
            recipeName: nameToSave,
            originalRecipeId: originalRecipeID || null, // Store the ID of the recipe being marked as made
            tags: recipeTagsToSave,                     // Store the tags of the recipe at this time
            timestamp: timestampForHistory,             // The date it was made
            notes: notes || "",                         // User's notes
            // recordCreatedAt: new Date().toISOString() // Optional: if you want to timestamp the history record itself
        };

        console.log("Attempting to save history entry:", JSON.stringify(historyEntry, null, 2));
        let success = false;

        if (currentUser) {
            historyEntry.uid = currentUser.uid; // Add UID for Firestore document
            console.log("Saving history to Firestore for user:", currentUser.uid);
            try {
                await db.collection("history").add(historyEntry);
                console.log("✅ History entry added to Firestore!");
                success = true;
            } catch (err) {
                console.error("❌ Failed to save history to Firestore:", err);
                alert('Failed to save history to your account: ' + err.message);
            }
        } else {
            // User is NOT LOGGED IN: Save to LocalDB
            if (!localDB) {
                alert("Local storage is not available. Please sign in to save history permanently.");
                console.error("Attempted to save local history, but localDB is not initialized.");
                return; // Exit if localDB isn't ready
            }
            // 'localId' for the history entry itself will be auto-generated by Dexie's '++localId' primary key
            console.log("Saving history to LocalDB.");
            try {
                const addedId = await localDB.history.add(historyEntry); // Dexie's add() returns the ID
                console.log("✅ History entry added to LocalDB with localId:", addedId);
                success = true;
            } catch (err) {
                console.error("❌ Failed to save history to LocalDB:", err.stack || err);
                alert('Failed to save history locally: ' + err.message);
            }
        }

        if (success) {
            form.innerHTML = `<div class="text-success fw-bold p-2">✅ Marked as made${currentUser ? '!' : ' (locally)!'}</div>`;
            setTimeout(() => {
                if (form.parentNode) form.remove();
            }, 2000);
            // If history view is active, it should ideally refresh.
            // Or, a more global event system could notify the history view to update.
            // For now, user will see update next time they visit History.
        }
        // If not successful, the form remains for the user to try again or cancel.
        // Error messages are handled by alerts within the try/catch blocks.
    };

    cancelBtn.onclick = () => {
        if (form.parentNode) form.remove();
    };

    form.appendChild(textarea);
    form.appendChild(controls);
    // Insert the form after the card's main content but before other action buttons if any,
    // or simply at the end of the card body.
    // Assuming 'card' is the main recipe card element:
    const cardBody = card.querySelector('.card-body'); // Or a more specific container within the card
    if (cardBody) {
        // Check if there's a row of buttons at the bottom of card-body (like plan meal, mark as made)
        const bottomButtonRow = cardBody.querySelector('.justify-content-start.gap-2.mt-3.pt-2.border-top');
        if (bottomButtonRow) {
            cardBody.insertBefore(form, bottomButtonRow); // Insert form before the bottom button row
        } else {
            cardBody.appendChild(form); // Append to end of card body if specific row not found
        }
    } else {
        card.appendChild(form); // Fallback if no .card-body found
    }
    
    textarea.focus();
}

function stripBase64Header(dataUrl) {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}

/**
 * Preprocesses an image by resizing it, optionally converting to grayscale and adjusting contrast,
 * and then outputs it as a base64 data URL (JPEG format).
 * @param {HTMLImageElement} imgElement - The <img> element containing the loaded source image.
 * @returns {string|null} The base64 data URL of the processed image (e.g., 'data:image/jpeg;base64,...') or null on error.
 */
function preprocessImage(imgElement) {
    if (!imgElement || !(imgElement instanceof HTMLImageElement) || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        console.error("preprocessImage: Invalid image element or image not loaded.", imgElement);
        return null;
    }

    const canvas = document.getElementById('preprocessCanvas'); // Make sure this canvas element exists in your HTML
    if (!canvas) {
        console.error("preprocessImage: Canvas element with ID 'preprocessCanvas' not found!");
        return null;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error("preprocessImage: Could not get 2D context from canvas.");
        return null;
    }

    // --- Image Resizing Logic ---
    const MAX_WIDTH = 1200;  // Max width for the processed image (pixels)
    const MAX_HEIGHT = 1600; // Max height for the processed image (pixels)

    let width = imgElement.naturalWidth;
    let height = imgElement.naturalHeight;

    // Calculate new dimensions to fit within MAX_WIDTH and MAX_HEIGHT while maintaining aspect ratio
    if (width > height) {
        if (width > MAX_WIDTH) {
            height = Math.round(height * (MAX_WIDTH / width));
            width = MAX_WIDTH;
        }
    } else {
        if (height > MAX_HEIGHT) {
            width = Math.round(width * (MAX_HEIGHT / height));
            height = MAX_HEIGHT;
        }
    }
    // If the image is already smaller than both max dimensions, it will use its original size
    // unless you want to enforce a minimum size or always resize.
    // This logic primarily scales down large images.

    canvas.width = width;
    canvas.height = height;

    console.log(`preprocessImage: Resizing image from ${imgElement.naturalWidth}x${imgElement.naturalHeight} to ${width}x${height}`);

    // Optional: Fill background with white if converting transparent PNGs to JPEG
    // ctx.fillStyle = "#FFFFFF";
    // ctx.fillRect(0, 0, width, height);

    ctx.drawImage(imgElement, 0, 0, width, height); // Draw the (potentially scaled) image onto the canvas

    // --- Optional: Grayscale and Contrast Adjustments ---
    // These can sometimes help OCR/AI but also increase processing time slightly.
    // Test with and without these to see if they improve your AI results significantly
    // after resizing and JPEG conversion.
    /*
    try {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const brightness = 1.0; // 1.0 means no change
        const contrast = 1.0;   // 1.0 means no change (values > 1 increase contrast)

        for (let i = 0; i < data.length; i += 4) {
            // Grayscale (luminosity method)
            let gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];

            // Apply brightness and contrast
            // Formula: factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            // color = factor * (color - 128) + 128;
            // Simplified for less aggressive changes:
            gray = ((gray / 255 - 0.5) * contrast + 0.5) * 255; // Contrast
            gray = gray * brightness; // Brightness

            gray = Math.max(0, Math.min(255, gray)); // Clamp to 0-255

            data[i] = gray;     // Red
            data[i+1] = gray;   // Green
            data[i+2] = gray;   // Blue
            // Alpha (data[i+3]) remains unchanged
        }
        ctx.putImageData(imageData, 0, 0);
        console.log("preprocessImage: Applied grayscale and contrast adjustments.");
    } catch (err) {
        console.error("preprocessImage: Error during pixel manipulation (grayscale/contrast):", err);
        // Continue without these adjustments if they fail
    }
    */

    // --- Output as JPEG with Quality Control ---
    try {
        const quality = 0.75; // JPEG quality (0.0 to 1.0). 0.7 to 0.8 is usually a good balance.
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        console.log(`preprocessImage: Generated JPEG data URL with quality ${quality}. Length: ${dataUrl.length}`);
        return dataUrl;
    } catch (err) {
        console.error("preprocessImage: Error converting canvas to JPEG data URL:", err);
        // Fallback to PNG if JPEG fails (e.g., browser doesn't support quality for JPEG on canvas)
        try {
            console.warn("preprocessImage: Falling back to PNG format.");
            const dataUrlPng = canvas.toDataURL('image/png');
            console.log(`preprocessImage: Generated PNG data URL. Length: ${dataUrlPng.length}`);
            return dataUrlPng;
        } catch (pngErr) {
            console.error("preprocessImage: Error converting canvas to PNG data URL as fallback:", pngErr);
            return null;
        }
    }
}


function parseOcrToRecipeFields(ocrText) {
  // 🧼 Normalize Unicode fractions
  ocrText = normalizeFractions(ocrText);

  const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l);

  const recipe = {
    title: '',
    ingredients: [],
    instructions: ''
  };

  // ... rest unchanged ...


  let inIngredients = false;
  let inInstructions = false;
  const instructionLines = [];

  const knownUnits = new Set([
    'teaspoon', 'teaspoons', 'tsp',
    'tablespoon', 'tablespoons', 'tbsp',
    'cup', 'cups',
    'oz', 'ounce', 'ounces',
    'lb', 'pound', 'pounds',
    'clove', 'cloves',
    'stick', 'sticks',
    'gram', 'grams', 'g',
    'kg', 'ml', 'l',
    'pinch', 'dash', 'can', 'cans', 'package', 'packages',
    'slice', 'slices', 'bunch', 'bunches'
  ]);
  

  lines.forEach(line => {
    const lower = line.toLowerCase();
    // ✅ Skip decorative divider lines like ============
    if (/^=+$/.test(line)) return;

    // ✅ Section switching — keep these to set flags
    if (lower.includes('ingredient') || lower.includes('🧂')) {
      inIngredients = true;
      inInstructions = false;
      return;
    }

    if (
      lower.includes('instruction') ||
      lower.includes('method') ||
      lower.includes('directions') ||
      lower.includes('📝')
    ) {
      inInstructions = true;
      inIngredients = false;
      return;
    }

    if (lower.includes('📛')) {
      return;
    }

    if (!recipe.title) {
      recipe.title = line;
      return;
    }

    if (inIngredients) {
      const match = line.match(/^(\d+\s\d\/\d|\d+\/\d|\d+(?:\.\d+)?)?\s*([a-zA-Z]+)?\s+(.+)$/);
      if (match) {
        const qty = (match[1] || '').trim();
        let unit = (match[2] || '').trim().toLowerCase();
        let name = (match[3] || '').trim();
    
        // ✅ If the "unit" isn't a known unit, treat it as part of the name
        if (!knownUnits.has(unit)) {
          name = `${unit} ${name}`.trim(); // prepend unit into name
          unit = qty ? 'whole' : ''; // fallback unit
        }

         // ✅ Log the result for debug
          console.log('🔍 Parsed Ingredient Line:', {
            original: line,
            quantity: qty,
            unit: unit,
            name: name
          });
    
        if (name) {
          recipe.ingredients.push({
            name,
            quantity: qty || '',
            unit
          });
        }
      }
    }
     

    if (inInstructions) {
      instructionLines.push(line);
    }
  });

  recipe.instructions = instructionLines.join(' ').trim();
  return recipe;
}

async function loadRecipesFromLocal() {
    if (!localDB) {
        console.warn("LocalDB not initialized, cannot load local recipes.");
        recipes = [];
        showRecipeFilter();
        applyAllRecipeFilters(); // Display the empty state
        return;
    }
    try {
        const localRecipes = await localDB.recipes.orderBy('timestamp').reverse().toArray();
        // The 'isLocal' flag is important for functions that handle both cloud and local data
        recipes = localRecipes.map(r => ({ ...r, id: r.localId, isLocal: true }));
        console.log("Loaded recipes from LocalDB:", recipes);
        showRecipeFilter(); 
        // This is the crucial missing line that tells the app to render the recipes
        applyAllRecipeFilters(); 
    } catch (error) {
        console.error("❌ Error loading recipes from LocalDB:", error.stack || error);
        recipes = [];
        showRecipeFilter();
        applyAllRecipeFilters(); // Also render the empty state if there's an error
    }
}

// Add the "async" keyword here
async function loadInitialRecipes() {
    if (currentUser) {
        console.log("User is logged in, loading recipes from Firestore.");
        await loadRecipesFromFirestore(); // Use await here
    } else {
        console.log("User is not logged in, loading recipes from LocalDB.");
        await loadRecipesFromLocal(); // And here
    }
}

function showSuccessMessage(message) {
    const topBar = document.getElementById('topBar');
    // Calculate the height of the top bar and add 16px (1rem) of margin.
    const topOffset = (topBar ? topBar.offsetHeight : 0) + 16;

    const successAlert = document.createElement('div');
    // We removed the 'top-0' and 'mt-3' classes to set the position with JavaScript.
    successAlert.className = 'alert alert-success text-center position-fixed start-50 translate-middle-x shadow-sm';
    
    // --- MODIFIED STYLES ---
    successAlert.style.top = `${topOffset}px`;
    successAlert.style.zIndex = 1060; // Ensures it appears above all other content.
    // --- END MODIFICATIONS ---
    
    successAlert.style.width = '90%';
    successAlert.style.maxWidth = '400px';
    successAlert.textContent = message;

    document.body.appendChild(successAlert);

    setTimeout(() => {
        // Add a fade-out effect for a smoother exit
        successAlert.style.transition = 'opacity 0.5s ease';
        successAlert.style.opacity = '0';
        setTimeout(() => successAlert.remove(), 500);
    }, 2500); // Start fading out after 2.5 seconds
}

function showRandomRecipe() {
  const view = document.getElementById('mainView');

  if (recipes.length === 0) {
    view.innerHTML = "<p>No recipes available.</p>";
    return;
  }

  const randomIndex = Math.floor(Math.random() * recipes.length);
  const randomRecipe = recipes[randomIndex];

  view.innerHTML = `
    <h5 class="mb-3">🎲 Random Recipe</h5>
    <div id="randomRecipeCard"></div>
  `;

  displayRecipes([randomRecipe], 'randomRecipeCard');
}

function clearHistoryFilters() {
    const historySearchInput = document.getElementById('historySearch');
    const historyTagSearchInput = document.getElementById('historyTagSearch');

    if (historySearchInput) historySearchInput.value = '';
    if (historyTagSearchInput) historyTagSearchInput.value = '';

    filterHistory(); // Re-apply empty filters to show all history items
}

function viewHistory() {
    // If using page titles and active nav states:
    updatePageTitle("History");
    setActiveNavButton("history");

    const view = document.getElementById('mainView');
    if (!view) {
        console.error("mainView element not found for viewHistory");
        return;
    }
    view.className = 'section-history container py-3'; // Consistent class

    view.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <button class="btn btn-outline-info btn-sm" type="button" data-bs-toggle="collapse" data-bs-target="#historyFiltersCollapse" aria-expanded="false" aria-controls="historyFiltersCollapse" title="Toggle history filters">
                <i class="bi bi-funnel-fill"></i> Filters
            </button>
        </div>

        <div class="collapse mb-3" id="historyFiltersCollapse">
            <div class="filter-section card card-body bg-light-subtle">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">Filter History</h6>
                    <button class="btn btn-outline-secondary btn-sm" type="button" onclick="clearHistoryFilters()" title="Clear all history filters">
                        <i class="bi bi-x-lg"></i> Clear Filters
                    </button>
                </div>
                <div class="row g-2">
                    <div class="col-md-6">
                        <label for="historySearch" class="form-label small mb-1">Search Notes/Recipe:</label>
                        <input type="text" class="form-control form-control-sm" id="historySearch" placeholder="Search notes or recipe name..." oninput="filterHistory()">
                    </div>
                    <div class="col-md-6">
                        <label for="historyTagSearch" class="form-label small mb-1">Filter by Tag(s):</label>
                        <input type="text" class="form-control form-control-sm" id="historyTagSearch" placeholder="e.g., dinner,easy (comma-sep)" oninput="filterHistory()">
                    </div>
                </div>
            </div>
        </div>

        <div id="historyListContainer">
            <div id="historyList" class="mt-2">Loading history...</div>
        </div>
    `;

    // Load history data (which will then call renderHistoryList)
    // The filterHistory function will be responsible for applying filters
    if (typeof filterHistory === "function") {
        filterHistory(); // Call initially to load and display (with empty filters)
    } else if (typeof loadHistory === "function") { // Fallback if filterHistory isn't the main loader yet
        loadHistory();
    } else {
        console.error("loadHistory or filterHistory function is not defined.");
        const historyListDiv = document.getElementById('historyList');
        if (historyListDiv) historyListDiv.innerHTML = '<p class="text-danger text-center">Error initializing history view.</p>';
    }
}


function renderHistoryList(entries, highlightTags = []) {
    const container = document.getElementById('historyList');
    if (!container) {
        console.error("History list container not found");
        return;
    }
    container.innerHTML = '';

    if (!entries || entries.length === 0) {
        container.innerHTML = '<div class="alert alert-light text-center" role="alert">No history found. Try marking some recipes as made!</div>';
        return;
    }

    entries.forEach(entry => { // 'entry.id' will be firestoreId or localId
        const card = document.createElement('div');
        card.className = 'card mb-3 shadow-sm';

        const body = document.createElement('div');
        body.className = 'card-body'; // Removed d-flex for simpler layout, can be re-added

        const contentDiv = document.createElement('div');
        contentDiv.className = 'flex-grow-1';

        const title = document.createElement('h6'); // Changed to h6 for better semantics
        title.className = 'card-title mb-1';
        title.textContent = entry.recipeName || entry.recipe; // Use recipeName

        const dateText = document.createElement('p');
        dateText.className = 'card-text text-muted small mb-1';
        dateText.innerHTML = `<i class="bi bi-calendar-check"></i> Made on: ${new Date(entry.timestamp).toLocaleDateString()}`;
        
        contentDiv.appendChild(title);
        contentDiv.appendChild(dateText);

        if (entry.tags && entry.tags.length > 0) {
            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'mb-2 history-tags';
            entry.tags.forEach(tag => {
                const lowerTag = tag.toLowerCase();
                const isHighlighted = highlightTags.some(ht => lowerTag.includes(ht.toLowerCase()));
                const badgeClass = isHighlighted ? 'badge bg-warning text-dark me-1 mt-1' : 'badge bg-secondary me-1 mt-1'; // Using bg-secondary
                const tagBadge = document.createElement('span');
                tagBadge.className = badgeClass;
                tagBadge.textContent = tag;
                tagsDiv.appendChild(tagBadge);
            });
            contentDiv.appendChild(tagsDiv);
        }

        if (entry.notes) {
            const notesText = document.createElement('p');
            notesText.className = 'card-text small';
            notesText.innerHTML = `<strong>Notes:</strong> ${entry.notes}`;
            contentDiv.appendChild(notesText);
        }

        const deleteButtonDiv = document.createElement('div');
        deleteButtonDiv.className = 'mt-2 text-end delete-area-history'; // For styling the button container if needed

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-outline-danger btn-sm flex-shrink-0';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Delete';
        deleteBtn.title = 'Delete this history entry';
        // `entry.id` is already correctly set to firestoreId or localId by viewHistory()
        deleteBtn.onclick = () => confirmDeleteHistory(entry.id, deleteButtonDiv, card); 

        deleteButtonDiv.appendChild(deleteBtn);
        
        body.appendChild(contentDiv);
        body.appendChild(deleteButtonDiv); // Add delete button div to the card body
        card.appendChild(body);
        container.appendChild(card);
    });
}




async function filterHistory() { // Made async for potential localDB operations
    const query = document.getElementById('historySearch').value.toLowerCase().trim();
    const tagSearch = document.getElementById('historyTagSearch').value.toLowerCase().trim();
    const tagTerms = tagSearch.split(',').map(t => t.trim()).filter(Boolean);

    if (currentUser) {
        // --- LOGGED IN: Filter Firestore data ---
        db.collection("history")
            .where("uid", "==", currentUser.uid)
            .orderBy("timestamp", "desc")
            .get()
            .then(snapshot => {
                const allEntries = snapshot.docs.map(doc => ({ firestoreId: doc.id, ...doc.data() }));
                const filtered = allEntries.filter(entry => {
                    const recipeName = entry.recipeName || entry.recipe || "";
                    const notes = entry.notes || "";
                    const matchesText = !query || (
                        recipeName.toLowerCase().includes(query) ||
                        notes.toLowerCase().includes(query)
                    );
                    const entryTags = (entry.tags || []).map(t => t.toLowerCase());
                    const matchesTags = tagTerms.length === 0 || tagTerms.every(term =>
                        entryTags.some(tag => tag.startsWith(term))
                    );
                    return matchesText && matchesTags;
                });
                renderHistoryList(filtered.map(e => ({...e, id: e.firestoreId })), tagTerms);
            })
            .catch(err => {
                console.error("Error filtering Firestore history:", err);
                document.getElementById('historyList').innerHTML = '<p class="text-danger">Error filtering history.</p>';
            });
    } else {
        // --- NOT LOGGED IN: Filter LocalDB data ---
        if (!localDB) {
            document.getElementById('historyList').innerHTML = '<p class="text-warning">Local storage not available to filter.</p>';
            return;
        }
        try {
            const allEntries = await localDB.history.orderBy('timestamp').reverse().toArray();
            const filtered = allEntries.filter(entry => {
                const recipeName = entry.recipeName || ""; // Ensure recipeName exists
                const notes = entry.notes || "";
                const matchesText = !query || (
                    recipeName.toLowerCase().includes(query) ||
                    notes.toLowerCase().includes(query)
                );
                const entryTags = (entry.tags || []).map(t => t.toLowerCase());
                const matchesTags = tagTerms.length === 0 || tagTerms.every(term =>
                    entryTags.some(tag => tag.startsWith(term))
                );
                return matchesText && matchesTags;
            });
            renderHistoryList(filtered.map(e => ({...e, id: e.localId })), tagTerms);
        } catch (err) {
            console.error("Error filtering LocalDB history:", err.stack || err);
            document.getElementById('historyList').innerHTML = '<p class="text-danger">Error filtering local history.</p>';
        }
    }
}


function confirmDeleteHistory(entryId, deleteAreaContainer, cardElement) {
    // Ensure deleteAreaContainer is valid and not already showing confirmation
    if (!deleteAreaContainer || deleteAreaContainer.querySelector('.confirm-delete-history-controls')) return;

    // Temporarily hide or clear previous content of deleteAreaContainer (like the original delete button if it was inside)
    const originalButton = deleteAreaContainer.querySelector('button'); // Assuming the button is inside
    if (originalButton) originalButton.style.display = 'none';


    const confirmControls = document.createElement('div');
    confirmControls.className = 'confirm-delete-history-controls d-flex align-items-center gap-2 justify-content-end'; // For inline display

    const confirmText = document.createElement('span');
    confirmText.className = 'text-danger small me-2';
    confirmText.textContent = 'Really delete?';

    const yesBtn = document.createElement('button');
    yesBtn.className = 'btn btn-danger btn-sm'; // Changed to danger for yes
    yesBtn.innerHTML = '<i class="bi bi-check-lg"></i> Yes';
    yesBtn.title = 'Confirm delete';

    const noBtn = document.createElement('button');
    noBtn.className = 'btn btn-secondary btn-sm'; // Changed to secondary for no
    noBtn.innerHTML = '<i class="bi bi-x-lg"></i> No';
    noBtn.title = 'Cancel delete';

    const cleanupConfirmationUI = () => {
        confirmControls.remove();
        if (originalButton) originalButton.style.display = ''; // Restore original button
    };

    yesBtn.onclick = () => {
        if (currentUser) {
            // --- LOGGED IN: Delete from Firebase ---
            db.collection('history').doc(entryId).delete()
                .then(() => {
                    console.log('✅ History entry deleted from Firestore:', entryId);
                    cardElement.remove(); // Remove from view
                    showSuccessMessage("History entry deleted.");
                })
                .catch((err) => {
                    console.error('❌ Failed to delete history entry from Firestore:', err);
                    alert('Failed to delete history entry: ' + err.message);
                    cleanupConfirmationUI(); // Restore UI on failure
                });
        } else {
            // --- NOT LOGGED IN: Delete from LocalDB ---
            if (!localDB) {
                alert("Local storage not available.");
                cleanupConfirmationUI();
                return;
            }
            localDB.history.delete(entryId) // entryId here is the localId
                .then(() => {
                    console.log('✅ History entry deleted from LocalDB:', entryId);
                    cardElement.remove(); // Remove from view
                    showSuccessMessage("Local history entry deleted.");
                })
                .catch(err => {
                    console.error('❌ Failed to delete history entry from LocalDB:', err.stack || err);
                    alert('Failed to delete local history entry: ' + err.message);
                    cleanupConfirmationUI(); // Restore UI on failure
                });
        }
    };

    noBtn.onclick = cleanupConfirmationUI;

    confirmControls.appendChild(confirmText);
    confirmControls.appendChild(yesBtn);
    confirmControls.appendChild(noBtn);
    deleteAreaContainer.appendChild(confirmControls); // Add controls to the provided container
}



function populateIngredientSelect() {
  const allIngredients = [...new Set(recipes.flatMap(r => r.ingredients))].sort();
  const select = document.getElementById('ingredientSelect');
  select.innerHTML = '';
  allIngredients.forEach(ing => {
    const opt = document.createElement('option');
    opt.value = ing;
    opt.textContent = ing;
    select.appendChild(opt);
  });
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function filterRecipesByText() { // This will now be triggered by ingredient search input
    applyAllRecipeFilters();
}

// Helper function to escape special regex characters and create a highlighting regex
function createHighlightRegex(term) {
    if (!term) return null;
    // Escape special characters in the search term for regex safety
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(${escapedTerm})`, 'gi'); // 'g' for global, 'i' for case-insensitive
}

// In script.js
async function renderFolders() {
    const folderList = document.getElementById('folderList');
    const folderActions = document.getElementById('folderActionsContainer');
    const addFolderContainer = document.getElementById('addFolderContainer');
    
    if (!folderList || !folderActions || !addFolderContainer) return;

    folderList.innerHTML = ''; 
    folderList.className = 'nav nav-pills flex-column folder-list-container';
    
    // --- Render Edit/Done Button ---
    if (folders.length > 0) {
        // ADD the "w-100" class to make the button full-width
        folderActions.innerHTML = `<button class="btn btn-outline-secondary btn-sm w-100" onclick="toggleFolderEditMode()">${isFolderEditMode ? 'Done' : 'Edit'}</button>`;
    } else {
        folderActions.innerHTML = '';
    }
    
    // --- Toggle UI based on Edit Mode ---
    if (isFolderEditMode) {
        folderList.classList.add('edit-mode-active');
        addFolderContainer.style.display = 'none';
    } else {
        folderList.classList.remove('edit-mode-active');
        addFolderContainer.style.display = 'block';
    }

    // --- The rest of the function remains exactly the same ---
    // --- Render "All Recipes" Link ---
    const allRecipesCount = recipes.length;
    const allRecipesItem = document.createElement('li');
    allRecipesItem.className = 'nav-item';
    allRecipesItem.innerHTML = `
        <a class="nav-link d-flex justify-content-between align-items-center" href="#">
            <span><i class="bi bi-collection me-2"></i> All Recipes</span>
            <span class="badge bg-light text-dark rounded-pill">${allRecipesCount}</span>
        </a>`;
    const allRecipesLink = allRecipesItem.querySelector('a');
    if (currentFolderId === null) allRecipesLink.classList.add('active');
    allRecipesLink.onclick = (e) => filterByFolder(e, null);
    folderList.appendChild(allRecipesItem);

    // --- Render Individual Folders ---
    if (currentUser && folders.length > 0) {
        folders.forEach(folder => {
            const recipeCount = recipes.filter(r => r.folderId === folder.id).length;
            const li = document.createElement('li');
            li.className = 'nav-item';
            li.innerHTML = `
                <a class="nav-link d-flex justify-content-between align-items-center" href="#">
                    <span><i class="bi bi-folder me-2"></i>${escapeHtml(folder.name)}</span>
                    <div class="d-flex align-items-center">
                        ${recipeCount > 0 ? `<span class="badge bg-light text-dark rounded-pill">${recipeCount}</span>` : ''}
                        <span class="delete-folder-icon-container ms-2">
                            <i class="bi bi-trash-fill text-danger" title="Delete Folder"></i>
                        </span>
                    </div>
                </a>`;

            const folderLink = li.querySelector('a');
            if (folder.id === currentFolderId) folderLink.classList.add('active');
            folderLink.onclick = (e) => filterByFolder(e, folder.id);

            const deleteIcon = li.querySelector('.delete-folder-icon-container');
            deleteIcon.onclick = (e) => {
                e.stopPropagation(); e.preventDefault();
                confirmDeleteFolder(folder.id, folder.name);
            };
            folderList.appendChild(li);
        });
    }
}

async function confirmDeleteFolder(folderId, folderName) {
    const title = `Delete Folder?`;
    const bodyContent = `
        <p>Are you sure you want to permanently delete the folder <strong>"${escapeHtml(folderName)}"</strong>?</p>
        <p class="text-muted small mt-3">This action will not delete the recipes inside the folder. They will be moved to "Uncategorized".</p>
    `;

    const buttons = [
        {
            text: 'Cancel',
            class: 'btn-secondary',
            dismiss: true // This property tells the modal to just close
        },
        {
            text: 'Yes, Delete Folder',
            class: 'btn-danger', // A red button for a destructive action
            onClick: async () => {
                // This is the deletion logic that now runs when the user clicks the red button
                try {
                    // Hide the modal before starting the async operations
                    if (infoConfirmModalInstance) infoConfirmModalInstance.hide();

                    // 1. Delete the folder document itself
                    await db.collection('folders').doc(folderId).delete();

                    // 2. Find all recipes in that folder and set their folderId to null
                    const recipesInFolderSnapshot = await db.collection('recipes')
                        .where('uid', '==', currentUser.uid)
                        .where('folderId', '==', folderId)
                        .get();

                    const batch = db.batch();
                    recipesInFolderSnapshot.forEach(doc => {
                        batch.update(doc.ref, { folderId: null });
                    });
                    await batch.commit();

                    showSuccessMessage(`Folder "${escapeHtml(folderName)}" deleted.`);

                    // Refresh the entire UI state
                    await loadFolders();
                    renderFolders();
                    await loadInitialRecipes(); // Reload recipes to update their folder status on the cards

                } catch (error) {
                    console.error("Error deleting folder:", error);
                    // Show a follow-up error modal if something goes wrong
                    showInfoConfirmModal("Error", "Failed to delete the folder. Please try again.");
                }
            }
        }
    ];

    // Call your generic modal function with the configuration above
    showInfoConfirmModal(title, bodyContent, buttons);
}

// This function resets the container back to its original "Add Folder" button
function restoreAddFolderButton() {
    const container = document.getElementById('addFolderContainer');
    if (container) {
        container.innerHTML = `
            <button class="btn btn-outline-secondary btn-sm w-100" onclick="createNewFolder()">
                <i class="bi bi-plus-circle"></i> Add Folder
            </button>
        `;
    }
}

async function saveNewFolder(folderName) {
    if (!currentUser) {
        alert("You must be logged in to create folders.");
        return;
    }
    
    try {
        await db.collection('folders').add({
            name: folderName,
            uid: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Refresh all UI elements that depend on the folder list
        await loadFolders();
        renderFolders();
        applyAllRecipeFilters(); // <-- ADD THIS LINE to refresh the recipe cards
        restoreAddFolderButton();

    } catch (error) {
        console.error("Error creating new folder:", error);
        alert("Could not create the folder. Please try again.");
    }
}

// This is the new function that builds the inline form, replacing the old prompt()
function createNewFolder() {
    const container = document.getElementById('addFolderContainer');
    if (!container || container.querySelector('.inline-folder-form')) return;

    container.innerHTML = `
        <div class="input-group input-group-sm inline-folder-form">
            <input type="text" class="form-control" placeholder="New folder name...">
            <button class="btn btn-success" type="button" title="Save Folder">
                <i class="bi bi-check-lg"></i>
            </button>
            <button class="btn btn-secondary" type="button" title="Cancel">
                <i class="bi bi-x-lg"></i>
            </button>
        </div>
    `;

    const input = container.querySelector('input');
    const saveBtn = container.querySelector('.btn-success');
    const cancelBtn = container.querySelector('.btn-secondary');

    input.focus();

    saveBtn.onclick = () => {
        const folderName = input.value.trim();
        if (folderName) {
            saveNewFolder(folderName);
        } else {
            input.classList.add('is-invalid'); // Show error if empty
        }
    };
    
    cancelBtn.onclick = restoreAddFolderButton;

    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveBtn.click();
        } else if (e.key === 'Escape') {
            cancelBtn.click();
        }
    };
}

function renderSortOptions() {
    const listContainer = document.getElementById('sortOptionsList');
    if (!listContainer) {
        console.error("Sidebar sort options list container (#sortOptionsList) not found.");
        return;
    }

    const sortOptions = [
        { id: 'newest', name: 'Recently Added', icon: 'bi-clock-history' },
        { id: 'modified', name: 'Date Modified', icon: 'bi-pencil-square' },
        // Use the outline star icon for consistency
        { id: 'rating', name: 'Rating', icon: 'bi-star' }, 
        // Use a simpler, more balanced icon for alphabetical sort
        { id: 'all', name: 'Alphabetical', icon: 'bi-sort-alpha-down' } // Keeping this one is fine, but bi-fonts is an alternative
    ];

    let sortOptionsHTML = "";
    sortOptions.forEach(option => {
        const isActive = option.id === currentSortOrder ? 'active' : '';
        sortOptionsHTML += `
            <li class="nav-item">
                <a class="nav-link ${isActive}" href="#" data-sort-id="${option.id}">
                    <i class="bi ${option.icon} me-2"></i> ${option.name}
                </a>
            </li>
        `;
    });
    listContainer.innerHTML = sortOptionsHTML;

    // The rest of this function (click listeners) remains the same
    listContainer.querySelectorAll('.nav-link').forEach(link => {
        link.onclick = async (e) => {
            e.preventDefault();
            const newSortOrder = link.dataset.sortId;
            if (newSortOrder === currentSortOrder) return;

            currentSortOrder = newSortOrder;
            
            if (currentUser) {
                try {
                    const userRef = db.collection('users').doc(currentUser.uid);
                    await userRef.set({
                        preferences: { recipeSortOrder: currentSortOrder }
                    }, { merge: true });
                    console.log(`Saved sort preference '${currentSortOrder}' to Firebase.`);
                } catch (error) {
                    console.error("Error saving user preference:", error);
                }
            }
            
            applyAllRecipeFilters();
            renderSortOptions();
            if (window.innerWidth < 992) {
                toggleSidebar();
            }
        };
    });
}
function toggleSidebar() {
    // It's looking for id="appSidebar"
    const sidebar = document.getElementById('appSidebar'); 
    // And id="sidebarBackdrop"
    const backdrop = document.getElementById('sidebarBackdrop');

    if (sidebar && backdrop) {
        sidebar.classList.toggle('open');
        backdrop.classList.toggle('show');
    } else {
        // This is the error you are seeing
        console.error("Sidebar or backdrop element not found!");
    }
}

async function renderFolders() {
    const folderList = document.getElementById('folderList');
    const folderActions = document.getElementById('folderActionsContainer');
    const addFolderContainer = document.getElementById('addFolderContainer');
    
    if (!folderList || !folderActions || !addFolderContainer) return;

    folderList.innerHTML = ''; 
    folderList.className = 'nav nav-pills flex-column folder-list-container';
    
    // --- Render Edit/Done Button ---
    if (folders.length > 0) {
        folderActions.innerHTML = `<button class="btn btn-outline-secondary btn-sm w-100" onclick="toggleFolderEditMode()">${isFolderEditMode ? 'Done' : 'Edit'}</button>`;
    } else {
        folderActions.innerHTML = '';
    }

    // --- NEW FIX: Automatically exit edit mode if no folders are left ---
    if (folders.length === 0 && isFolderEditMode) {
        isFolderEditMode = false; 
    }
    
    // --- Toggle UI based on Edit Mode ---
    if (isFolderEditMode) {
        folderList.classList.add('edit-mode-active');
        addFolderContainer.style.display = 'none';
    } else {
        folderList.classList.remove('edit-mode-active');
        addFolderContainer.style.display = 'block';
    }

    // --- Render "All Recipes" Link ---
    const allRecipesCount = recipes.length;
    const allRecipesItem = document.createElement('li');
    allRecipesItem.className = 'nav-item';
    allRecipesItem.innerHTML = `
        <a class="nav-link d-flex justify-content-between align-items-center" href="#">
            <span><i class="bi bi-collection me-2"></i> All Recipes</span>
            <span class="badge bg-light text-dark rounded-pill">${allRecipesCount}</span>
        </a>`;
    const allRecipesLink = allRecipesItem.querySelector('a');
    if (currentFolderId === null) allRecipesLink.classList.add('active');
    allRecipesLink.onclick = (e) => filterByFolder(e, null);
    folderList.appendChild(allRecipesItem);

    // --- Render Individual Folders ---
    if (currentUser && folders.length > 0) {
        folders.forEach(folder => {
            const recipeCount = recipes.filter(r => r.folderId === folder.id).length;
            const li = document.createElement('li');
            li.className = 'nav-item';
            li.innerHTML = `
                <a class="nav-link d-flex justify-content-between align-items-center" href="#">
                    <span><i class="bi bi-folder me-2"></i>${escapeHtml(folder.name)}</span>
                    <div class="d-flex align-items-center">
                        ${recipeCount > 0 ? `<span class="badge bg-light text-dark rounded-pill">${recipeCount}</span>` : ''}
                        <span class="delete-folder-icon-container ms-2">
                            <i class="bi bi-trash-fill text-danger" title="Delete Folder"></i>
                        </span>
                    </div>
                </a>`;

            const folderLink = li.querySelector('a');
            if (folder.id === currentFolderId) folderLink.classList.add('active');
            folderLink.onclick = (e) => filterByFolder(e, folder.id);

            const deleteIcon = li.querySelector('.delete-folder-icon-container');
            deleteIcon.onclick = (e) => {
                e.stopPropagation(); e.preventDefault();
                confirmDeleteFolder(folder.id, folder.name);
            };
            folderList.appendChild(li);
        });
    }
}
// script.js

function openRecipeSpecificChatModal(recipe) {
    if (!recipe || !recipe.id || !recipe.name) {
        console.error("Invalid or incomplete recipe data provided for Chef Bot chat.", recipe);
        alert("Cannot open chat: recipe data is missing.");
        return;
    }

    let conversationHistory = recipe.chatHistory ? [...recipe.chatHistory] : [];
    const MAX_HISTORY_TURNS = 10; // Can increase this now that it's persisted

    const existingChatModalElement = document.getElementById('recipeChatModal');
    if (existingChatModalElement) {
        const existingBsModal = bootstrap.Modal.getInstance(existingChatModalElement);
        if (existingBsModal) {
            existingBsModal.hide();
        } else {
            existingChatModalElement.remove();
        }
    }

    const chatModal = document.createElement('div');
    chatModal.id = 'recipeChatModal';
    chatModal.className = 'modal fade';
    chatModal.setAttribute('tabindex', '-1');
    chatModal.setAttribute('aria-labelledby', 'recipeChatModalLabel');
    chatModal.setAttribute('aria-hidden', 'true');
    chatModal.dataset.bsKeyboard = "false";
    chatModal.dataset.bsBackdrop = "static";

    chatModal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="recipeChatModalLabel">
                        <i class="bi bi-robot"></i> Chat about: <span class="fw-semibold">${escapeHtml(recipe.name)}</span>
                    </h5>
                    <button type="button" class="btn-close" aria-label="Close"></button>
                </div>
                <div class="modal-body" style="min-height: 300px; display: flex; flex-direction: column;">
                    <div id="recipeChatMessages" class="flex-grow-1 overflow-auto mb-3 p-2 border rounded bg-light-subtle" style="font-size: 0.9rem;">
                        <p class="text-muted small text-center p-2">Ask any questions about "${escapeHtml(recipe.name)}"! For example: "How can I make this vegetarian?", "What's a good wine pairing?", "Can I double the servings?".</p>
                    </div>
                    <div class="input-group">
                        <textarea id="recipeChatInput" class="form-control" placeholder="Type your question..." rows="2" aria-label="Your question about the recipe"></textarea>
                        <button id="sendRecipeChatBtn" class="btn btn-primary" type="button">
                            <i class="bi bi-send-fill"></i> Send
                        </button>
                    </div>
                    <div id="recipeChatUpdateArea" class="mt-3 border p-3 rounded bg-light" style="display:none;">
                        <h6 class="mb-2"><i class="bi bi-lightbulb-fill text-warning"></i> Chef Bot Suggests an Update:</h6>
                        <div id="suggestedUpdateText" class="bg-white p-2 border rounded small" style="max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;"></div>
                        <div class="text-end mt-2">
                            <button id="saveAsNewRecipeBtn" class="btn btn-sm btn-outline-primary me-2" type="button">
                                <i class="bi bi-plus-circle"></i> Save as New
                            </button>
                            <button id="applyRecipeUpdateBtn" class="btn btn-sm btn-success" type="button">
                                <i class="bi bi-check-circle"></i> Apply This Update
                            </button>
                            <button id="dismissRecipeUpdateBtn" class="btn btn-sm btn-outline-secondary ms-2" type="button">
                                <i class="bi bi-x-circle"></i> Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(chatModal);
    document.body.classList.add('modal-open-custom');

    const chatInput = document.getElementById('recipeChatInput');
    const sendBtn = document.getElementById('sendRecipeChatBtn');
    const messagesContainer = document.getElementById('recipeChatMessages');
    const updateArea = document.getElementById('recipeChatUpdateArea');
    const suggestedUpdateTextElement = document.getElementById('suggestedUpdateText'); // Renamed to avoid conflict
    const applyUpdateBtn = document.getElementById('applyRecipeUpdateBtn');
    const saveAsNewBtn = document.getElementById('saveAsNewRecipeBtn');
    const dismissUpdateBtn = document.getElementById('dismissRecipeUpdateBtn');
    const closeButtonInModalHeader = chatModal.querySelector('.modal-header .btn-close');

    const bsChatModal = new bootstrap.Modal(chatModal);
    if (bsChatModal) bsChatModal.show();
    if(chatInput) chatInput.focus();

    const initialPlaceholderMessage = messagesContainer ? messagesContainer.querySelector('p.text-muted.small') : null;

     const addChatMessage = (message, sender = 'bot', isError = false) => {
        if (!messagesContainer) return;
        if (initialPlaceholderMessage && messagesContainer.contains(initialPlaceholderMessage) && messagesContainer.children.length === 1 && sender !== 'initial') {
             initialPlaceholderMessage.remove();
        }
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('mb-2', 'chat-message-row', sender === 'user' ? 'text-end' : 'text-start');
        
        const msgBubble = document.createElement('div');
        msgBubble.classList.add('p-2', 'rounded', 'chat-bubble');
        msgBubble.style.display = 'inline-block';
        msgBubble.style.maxWidth = '85%';
        msgBubble.style.textAlign = 'left';

        if (sender === 'user') {
            msgBubble.classList.add('bg-primary', 'text-white');
        } else if (isError) {
            msgBubble.classList.add('bg-danger-subtle', 'text-danger-emphasis');
        } else { // Bot's normal message
            msgBubble.classList.add('bg-body-secondary'); // CHANGED from bg-light
            msgBubble.classList.add('text-dark'); // Ensure text color has good contrast
            // Optionally, add a subtle border to bot messages
            // msgBubble.style.border = "1px solid #dee2e6"; // Bootstrap's $gray-300
        }
        
        msgBubble.textContent = message;
        
        msgDiv.appendChild(msgBubble);
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const renderExistingHistory = () => {
        const initialPlaceholderMessage = messagesContainer.querySelector('p.text-muted.small');
        if (conversationHistory.length > 0 && initialPlaceholderMessage) {
            initialPlaceholderMessage.remove();
        }
        conversationHistory.forEach(turn => {
            // 'model' is what the Gemini API uses, but your client might see 'bot'
            const sender = turn.role === 'user' ? 'user' : 'bot';
            addChatMessage(turn.text, sender);
        });
    };
    renderExistingHistory(); // Call this to display history when the modal opens

    if (sendBtn && chatInput) {
        const handleSend = async () => {
            const userQuestion = chatInput.value.trim();
            if (!userQuestion) return;

            addChatMessage(userQuestion, 'user');
            chatInput.value = '';
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';

            // Add user question to history
            conversationHistory.push({ role: "user", text: userQuestion });
            if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
                conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
            }

            chatInput.value = '';
            chatInput.disabled = true;
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...';
            if (updateArea) updateArea.style.display = 'none';

            try {
                const response = await fetch('/.netlify/functions/ask-about-recipe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipeContext: {
                            id: recipe.id, name: recipe.name, ingredients: recipe.ingredients,
                            instructions: recipe.instructions, tags: recipe.tags, isLocal: !!recipe.isLocal // Pass isLocal flag
                        },
                        question: userQuestion,
                        history: conversationHistory
                    })
                });
                
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Error ${response.status} from server.`);
                }

                if (data.answer) {
                    addChatMessage(data.answer, 'bot');
                    conversationHistory.push({ role: "model", text: data.answer });
                    if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
                        conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
                    }
                    await saveChatHistoryToRecipe(recipe.id, conversationHistory, !!recipe.isLocal);
                } else {
                    throw new Error("AI response was missing an answer.");
                }

                if (data.suggestedUpdate && Object.keys(data.suggestedUpdate).length > 0) {
                    if (updateArea && suggestedUpdateTextElement && applyUpdateBtn && dismissUpdateBtn && saveAsNewBtn) {
                        updateArea.style.display = 'block';
                        
                        let formattedUpdateDetailsHTML = ""; // Build as HTML string
                        if (data.suggestedUpdate.name) {
                            formattedUpdateDetailsHTML += `<p><strong>New Name:</strong> ${escapeHtml(data.suggestedUpdate.name)}</p>`;
                        }
                        if (data.suggestedUpdate.ingredients && Array.isArray(data.suggestedUpdate.ingredients)) {
                            formattedUpdateDetailsHTML += "<p><strong>Updated Ingredients:</strong></p><ul>";
                            data.suggestedUpdate.ingredients.forEach(ing => {
                                const q = escapeHtml(ing.quantity || '');
                                const u = escapeHtml(ing.unit || '');
                                const n = escapeHtml(ing.name || 'Unknown Ingredient');
                                formattedUpdateDetailsHTML += `<li>${q} ${u} ${n}</li>`;
                            });
                            formattedUpdateDetailsHTML += "</ul>";
                        }
                        if (data.suggestedUpdate.instructions) {
                            formattedUpdateDetailsHTML += `<p><strong>Updated Instructions:</strong><br>${escapeHtml(data.suggestedUpdate.instructions).replace(/\n/g, '<br>')}</p>`;
                        }
                        if (data.suggestedUpdate.tags && Array.isArray(data.suggestedUpdate.tags)) {
                            formattedUpdateDetailsHTML += `<p><strong>Updated Tags:</strong> ${escapeHtml(data.suggestedUpdate.tags.join(', '))}</p>`;
                        }
                        
                        if (formattedUpdateDetailsHTML.trim() === "") {
                            suggestedUpdateTextElement.textContent = "The AI suggested some changes. Review its answer above for details.";
                        } else {
                            suggestedUpdateTextElement.innerHTML = formattedUpdateDetailsHTML; // Use innerHTML
                        }
                        
                        applyUpdateBtn.style.display = 'inline-block';
                        saveAsNewBtn.style.display = 'inline-block';
                        dismissUpdateBtn.style.display = 'inline-block';

                        applyUpdateBtn.onclick = async () => {
                            console.log("Applying update to current recipe:", data.suggestedUpdate);
                            const recipeToUpdate = { ...recipe }; 
                            if (data.suggestedUpdate.name && typeof data.suggestedUpdate.name === 'string') recipeToUpdate.name = data.suggestedUpdate.name;
                            if (Array.isArray(data.suggestedUpdate.ingredients)) recipeToUpdate.ingredients = data.suggestedUpdate.ingredients;
                            if (data.suggestedUpdate.instructions && typeof data.suggestedUpdate.instructions === 'string') recipeToUpdate.instructions = data.suggestedUpdate.instructions;
                            if (Array.isArray(data.suggestedUpdate.tags)) recipeToUpdate.tags = data.suggestedUpdate.tags;
                            recipeToUpdate.rating = recipe.rating || data.suggestedUpdate.rating || 0;
                            
                            try {
                                if (currentUser && !recipe.isLocal) { 
                                    recipeToUpdate.uid = recipe.uid || currentUser.uid;
                                    recipeToUpdate.timestamp = firebase.firestore.FieldValue.serverTimestamp();
                                    await db.collection('recipes').doc(recipe.id).set(recipeToUpdate, { merge: true });
                                    showSuccessMessage("Recipe updated in your account!");
                                } else if (localDB) { 
                                    recipeToUpdate.localId = recipe.id; 
                                    recipeToUpdate.timestamp = new Date().toISOString(); // Update local timestamp
                                    await localDB.recipes.put(recipeToUpdate);
                                    showSuccessMessage("Local recipe updated!");
                                }
                                if(bsChatModal) bsChatModal.hide();
                                loadInitialRecipes();
                            } catch (saveError) {
                                console.error("Error applying recipe update:", saveError);
                                addChatMessage("Failed to apply update: " + saveError.message, 'bot', true);
                            }
                            if(updateArea) updateArea.style.display = 'none';
                        };

                        saveAsNewBtn.onclick = async () => {
                            console.log("Saving AI suggested update as a new recipe:", data.suggestedUpdate);
                            const newRecipeData = {
                                name: data.suggestedUpdate.name || `${recipe.name} (AI Modified)`,
                                ingredients: data.suggestedUpdate.ingredients || recipe.ingredients,
                                instructions: data.suggestedUpdate.instructions || recipe.instructions,
                                tags: data.suggestedUpdate.tags || recipe.tags || [],
                                rating: 0,
                            };
                            await saveNewRecipeToStorage(newRecipeData); 
                            if(bsChatModal) bsChatModal.hide();
                            if(updateArea) updateArea.style.display = 'none';
                        };
                    }
                } else {
                    if (updateArea) updateArea.style.display = 'none';
                }
            } catch (err) {
                addChatMessage(`Error: ${err.message}`, 'bot', true);
                console.error("Error in recipe chat send:", err);
            } finally {
                if(sendBtn) sendBtn.disabled = false;
                if(sendBtn) sendBtn.innerHTML = '<i class="bi bi-send-fill"></i> Send';
                if(chatInput) {
                    chatInput.disabled = false;
                    chatInput.focus();
                }
            }
        };
        sendBtn.onclick = handleSend;
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    } else {
        console.error("Send button or chat input not found in recipe chat modal!");
    }

    if(dismissUpdateBtn && updateArea) {
        dismissUpdateBtn.onclick = () => {
            updateArea.style.display = 'none';
        };
    }
    
    if(closeButtonInModalHeader) {
        closeButtonInModalHeader.onclick = () => {
            if(bsChatModal) bsChatModal.hide();
        };
    }

    chatModal.addEventListener('hidden.bs.modal', () => {
        document.body.classList.remove('modal-open-custom');
        if (chatModal.parentNode) {
            chatModal.remove();
        }
        console.log("Recipe chat modal hidden and removed.");
        if (window.recipeSpecificChatSpeechRecognition && window.recipeSpecificChatIsListening) {
            window.recipeSpecificChatSpeechRecognition.stop();
            window.recipeSpecificChatIsListening = false;
        }
    });
}

/**
 * Saves the updated conversation history to a specific recipe.
 * @param {string} recipeId - The ID (Firestore or localId) of the recipe.
 * @param {Array<Object>} historyToSave - The full conversation history array to save.
 * @param {boolean} isLocal - True if the recipe is in LocalDB, false for Firestore.
 */
async function saveChatHistoryToRecipe(recipeId, historyToSave, isLocal) {
    console.log(`Saving chat history for recipe ID: ${recipeId}`);
    try {
        if (currentUser && !isLocal) {
            // Save to Firestore
            const recipeRef = db.collection('recipes').doc(recipeId);
            await recipeRef.update({
                chatHistory: historyToSave
            });
            console.log("✅ Chat history saved to Firestore.");
        } else if (localDB) {
            // Save to LocalDB
            await localDB.recipes.update(recipeId, {
                chatHistory: historyToSave
            });
            console.log("✅ Chat history saved to LocalDB.");
        }
        // Also update the in-memory 'recipes' array so the change is reflected immediately
        const recipeInMemory = recipes.find(r => r.id === recipeId);
        if (recipeInMemory) {
            recipeInMemory.chatHistory = historyToSave;
        }
    } catch (error) {
        console.error("Error saving chat history:", error);
        // Optionally, inform the user that history could not be saved
        // showInfoConfirmModal("Warning", "Could not save chat history for this recipe.");
    }
}

// You'll need a generic function to save a NEW recipe object
// This is similar to your existing `saveRecipe` but takes data as an argument
// **Modify saveNewRecipeToStorage to RETURN the ID**
async function saveNewRecipeToStorage(recipeDataObject) {
    console.log("saveNewRecipeToStorage called with:", recipeDataObject);
    let savedId = null; // Changed from 'success' boolean

    // ... (your existing dataToSave setup) ...
     const dataToSave = {
        name: recipeDataObject.name || "Untitled Recipe",
        ingredients: recipeDataObject.ingredients || [],
        instructions: recipeDataObject.instructions || "",
        tags: recipeDataObject.tags || [],
        rating: recipeDataObject.rating || 0,
    };


    if (currentUser) {
        dataToSave.uid = currentUser.uid;
        dataToSave.timestamp = firebase.firestore.FieldValue.serverTimestamp();
        try {
            const docRef = await db.collection('recipes').add(dataToSave);
            savedId = docRef.id; // Store the Firestore ID
            console.log("✅ New recipe saved to Firestore with ID:", savedId);
            // Moved success message out, as this function might be called multiple times during plan save
        } catch (error) {
            console.error("❌ Error saving new recipe to Firestore:", error);
            // Keep savedId as null
        }
    } else {
        if (!localDB) {
             console.error("Local storage not available for saveNewRecipeToStorage.");
             return null; // Return null if storage unavailable
        }
        dataToSave.localId = generateLocalUUID(); // Generate local ID
        dataToSave.timestamp = new Date().toISOString();
        try {
            // Dexie's add() returns the auto-generated primary key OR the provided one if defined
            // Since we provide 'localId', we use that.
             await localDB.recipes.add(dataToSave); 
             savedId = dataToSave.localId; // Store the local ID
            console.log("✅ New recipe saved to LocalDB with localId:", savedId);
        } catch (error) {
            console.error("❌ Error saving new recipe to LocalDB:", error.stack || error);
            // Keep savedId as null
        }
    }
    
    // Don't reload recipes here if called during plan generation
    // loadInitialRecipes(); // Refresh the main list 

    return savedId; // Return the ID (or null if failed)
}

function displayRecipes(listToDisplay, containerId = 'recipeResults', options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error("Recipe container not found:", containerId);
        return;
    }
    container.innerHTML = '';

    if (!listToDisplay || listToDisplay.length === 0) {
        container.innerHTML = '<p class="text-muted text-center mt-3">No matching recipes found.</p>';
        return;
    }

    const nameRegex = options.highlightNameTerm ? createHighlightRegex(options.highlightNameTerm) : null;
    const ingredientRegexes = options.highlightIngredients ? options.highlightIngredients.map(term => createHighlightRegex(term)).filter(r => r) : [];
    const tagRegexes = options.highlightTags ? options.highlightTags.map(term => createHighlightRegex(term)).filter(r => r) : [];

    listToDisplay.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'card mb-3 shadow-sm recipe-card';
        card.dataset.recipeId = recipe.id;

        const body = document.createElement('div');
        body.className = 'card-body p-3';

        // --- Title Row (No changes here) ---
        const titleRow = document.createElement('div');
        titleRow.className = 'd-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 mb-2';
        const titleElement = document.createElement('h5');
        titleElement.className = 'recipe-title mb-0 text-primary';
        let recipeName = recipe.name || "Untitled Recipe";
        if (nameRegex && options.highlightNameTerm && recipeName.toLowerCase().includes(options.highlightNameTerm.toLowerCase())) {
            titleElement.innerHTML = recipeName.replace(nameRegex, '<mark>$1</mark>');
        } else {
            titleElement.textContent = recipeName;
        }
        titleRow.appendChild(titleElement);
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'd-flex gap-2 align-items-center mt-2 mt-sm-0 recipe-card-actions flex-shrink-0';
        const shareBtn = document.createElement('button');
        shareBtn.className = 'btn btn-outline-secondary btn-sm btn-share';
        if (!currentUser) {
            shareBtn.disabled = true;
            shareBtn.title = 'Sign in to share recipes via a link';
            shareBtn.innerHTML = '<i class="bi bi-share"></i>';
            shareBtn.onclick = (e) => { e.preventDefault(); showLoginModal(); };
        } else {
            shareBtn.innerHTML = '<i class="bi bi-share-fill"></i>';
            shareBtn.title = 'Share recipe link';
            shareBtn.onclick = () => shareRecipe(recipe.id);
        }
        buttonGroup.appendChild(shareBtn);
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-outline-primary btn-sm';
        editBtn.innerHTML = '<i class="bi bi-pencil-fill"></i>';
        editBtn.title = "Edit recipe";
        editBtn.onclick = () => openInlineEditor(recipe.id, card);
        buttonGroup.appendChild(editBtn);
        const chefBotRecipeBtn = document.createElement('button');
        chefBotRecipeBtn.className = 'btn btn-outline-warning btn-sm ask-chef-bot-recipe';
        chefBotRecipeBtn.innerHTML = '<i class="bi bi-robot"></i>';
        chefBotRecipeBtn.title = `Ask Chef Bot about "${recipe.name}"`;
        chefBotRecipeBtn.dataset.recipeId = recipe.id;
        chefBotRecipeBtn.onclick = () => { openRecipeSpecificChatModal(recipe); };
        buttonGroup.appendChild(chefBotRecipeBtn);
        const deleteArea = document.createElement('div');
        deleteArea.className = 'delete-area position-relative d-inline-block';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-outline-danger btn-sm';
        deleteBtn.innerHTML = '<i class="bi bi-trash-fill"></i>';
        deleteBtn.title = "Delete recipe";
        deleteBtn.onclick = () => confirmDeleteRecipe(recipe.id, deleteArea);
        deleteArea.appendChild(deleteBtn);
        buttonGroup.appendChild(deleteArea);
        const folderGroup = document.createElement('div');
        folderGroup.className = 'btn-group'; // Use a btn-group for the dropdown

        // Find the current folder's name using the global 'folders' array
        const currentFolder = recipe.folderId ? folders.find(f => f.id === recipe.folderId) : null;
        const currentFolderName = currentFolder ? currentFolder.name : 'Uncategorized';
        
        folderGroup.innerHTML = `
            <button type="button" class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" title="Folder: ${escapeHtml(currentFolderName)}">
                <i class="bi bi-folder me-1"></i>
                <span class="folder-name-display">${escapeHtml(currentFolderName)}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
                </ul>
        `;

        const dropdownMenu = folderGroup.querySelector('.dropdown-menu');

        // Add the "Uncategorized" option
        const uncategorizedItem = document.createElement('li');
        uncategorizedItem.innerHTML = `<a class="dropdown-item" href="#">Uncategorized</a>`;
        uncategorizedItem.onclick = (e) => {
            e.preventDefault();
            assignRecipeToFolder(recipe.id, null); // Pass null to uncategorize
        };
        dropdownMenu.appendChild(uncategorizedItem);

        // Add a divider if there are folders
        if (folders.length > 0) {
            const divider = document.createElement('li');
            divider.innerHTML = '<hr class="dropdown-divider">';
            dropdownMenu.appendChild(divider);
        }

        // Add an item for each available folder
        folders.forEach(folder => {
            const folderItem = document.createElement('li');
            folderItem.innerHTML = `<a class="dropdown-item" href="#">${escapeHtml(folder.name)}</a>`;
            folderItem.onclick = (e) => {
                e.preventDefault();
                assignRecipeToFolder(recipe.id, folder.id);
            };
            dropdownMenu.appendChild(folderItem);
        });

        // Add the new folder dropdown to the right of the other buttons
        buttonGroup.appendChild(folderGroup);
        titleRow.appendChild(buttonGroup);
        body.appendChild(titleRow);

        // --- Tags Row (No changes here) ---
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'recipe-tags mb-2';
        if (recipe.tags && recipe.tags.length > 0) {
            recipe.tags.forEach(tag => {
                const tagBadge = document.createElement('span');
                tagBadge.className = 'badge me-1 mb-1 bg-secondary';
                let tagDisplay = tag;
                let isTagHighlighted = false;
                if (tagRegexes.length > 0) {
                    tagRegexes.forEach(regex => {
                        const searchTermFromRegex = regex.source.replace(/^\(|\)$/g, '');
                        if (tag.toLowerCase().includes(searchTermFromRegex)) {
                            tagDisplay = tag.replace(regex, '<mark>$1</mark>');
                            isTagHighlighted = true;
                        }
                    });
                }
                if (isTagHighlighted) {
                    tagBadge.classList.remove('bg-secondary');
                    tagBadge.classList.add('bg-warning', 'text-dark');
                }
                tagBadge.innerHTML = tagDisplay;
                tagsDiv.appendChild(tagBadge);
            });
        }
        body.appendChild(tagsDiv);

        // --- Meta Info Row (Ratings & Date Added) (MODIFIED) ---
        const metaInfoRow = document.createElement('div');
        metaInfoRow.className = 'd-flex justify-content-between align-items-center mb-2'; // This creates the row
        
        const dateAddedElement = document.createElement('small');
        dateAddedElement.className = 'text-muted';

        // Check if the timestamp exists and format it correctly
        if (recipe.timestamp) {
            let date;
            if (typeof recipe.timestamp.toDate === 'function') {
                date = recipe.timestamp.toDate(); // Firestore timestamp object
            } else {
                date = new Date(recipe.timestamp); // ISO string
            }
            dateAddedElement.innerHTML = `<i class="bi bi-clock-history me-1"></i>Added: ${date.toLocaleDateString()}`;
        }

        const lastModifiedElement = document.createElement('small');
        lastModifiedElement.className = 'text-muted ms-3'; // Add margin for spacing

        // Check if a lastModified date exists
        if (recipe.lastModified) {
            let modifiedDate;
            if (typeof recipe.lastModified.toDate === 'function') {
                modifiedDate = recipe.lastModified.toDate(); // Firestore
            } else {
                modifiedDate = new Date(recipe.lastModified); // LocalDB
            }
            lastModifiedElement.innerHTML = `<i class="bi bi-pencil-square me-1"></i>Edited: ${modifiedDate.toLocaleDateString()}`;
        }
        
        const ratingContainer = document.createElement('div');
        ratingContainer.className = 'rating-stars d-flex gap-1 align-items-center';
        if (currentUser) {
            for (let i = 1; i <= 5; i++) {
                const star = document.createElement('i');
                star.className = `bi text-warning ${i <= (recipe.rating || 0) ? 'bi-star-fill' : 'bi-star'}`;
                star.style.cursor = 'pointer';
                star.dataset.value = i;
                star.addEventListener('mouseenter', () => highlightStars(ratingContainer, i));
                star.addEventListener('mouseleave', () => resetStars(ratingContainer, recipe.rating || 0));
                star.addEventListener('click', () => updateRecipeRating(recipe.id, i, !currentUser));
                ratingContainer.appendChild(star);
            }
        } else if (recipe.rating && recipe.rating > 0) {
            for (let i = 1; i <= 5; i++) {
                const star = document.createElement('i');
                star.className = `bi text-warning ${i <= recipe.rating ? 'bi-star-fill' : 'bi-star'}`;
                ratingContainer.appendChild(star);
            }
        }
        
        // Add the date and stars to the meta info row
        metaInfoRow.appendChild(dateAddedElement);
        metaInfoRow.appendChild(lastModifiedElement);
        metaInfoRow.appendChild(ratingContainer);

        // Only append the meta row if it has content (either a date or stars)
        if (recipe.timestamp || ratingContainer.hasChildNodes()) {
            body.appendChild(metaInfoRow);
        }

        // --- Ingredients Table (No changes here) ---
        const table = document.createElement('table');
        table.className = 'table table-bordered table-sm mt-2 mb-2';
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th>Ingredient</th><th>Qty</th><th>Unit</th></tr>`;
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(ing => {
                const tr = document.createElement('tr');
                const nameTd = document.createElement('td');
                const ingName = typeof ing === 'object' ? (ing.name || '') : (ing || '');
                let ingNameDisplay = ingName;
                if (ingredientRegexes.length > 0) {
                    ingredientRegexes.forEach(regex => {
                        const searchTermFromRegex = regex.source.replace(/^\(|\)$/g, '');
                        if (ingName.toLowerCase().includes(searchTermFromRegex)) {
                            ingNameDisplay = ingName.replace(regex, '<mark>$1</mark>');
                        }
                    });
                }
                nameTd.innerHTML = ingNameDisplay;
                const qtyTd = document.createElement('td');
                qtyTd.textContent = typeof ing === 'object' ? (ing.quantity || '') : '';
                const unitTd = document.createElement('td');
                unitTd.textContent = typeof ing === 'object' ? (ing.unit || '') : '';
                tr.appendChild(nameTd); tr.appendChild(qtyTd); tr.appendChild(unitTd);
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="3" class="text-muted">No ingredients listed.</td></tr>';
        }
        table.appendChild(tbody);
        body.appendChild(table);

        // --- Instructions (No changes here) ---
        const instructionsTitle = document.createElement('h6');
        instructionsTitle.className = 'mt-3 mb-1 fw-semibold';
        instructionsTitle.textContent = 'Instructions';
        body.appendChild(instructionsTitle);
        const instructionsP = document.createElement('p');
        instructionsP.className = 'card-text recipe-instructions';
        instructionsP.style.whiteSpace = 'pre-wrap';
        instructionsP.textContent = recipe.instructions || 'No instructions provided.';
        body.appendChild(instructionsP);

        // --- Bottom Button Row (No changes here) ---
        const bottomButtonRow = document.createElement('div');
        bottomButtonRow.className = 'd-flex align-items-center justify-content-start gap-2 mt-3 pt-2 border-top';
        const madeBtn = document.createElement('button');
        madeBtn.className = 'btn btn-outline-info btn-sm';
        madeBtn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Mark as Made';
        madeBtn.onclick = (e) => markAsMade(recipe, e.target);
        bottomButtonRow.appendChild(madeBtn);
        const planArea = document.createElement('div');
        planArea.className = 'plan-area';
        const planBtn = document.createElement('button');
        planBtn.className = 'btn btn-outline-success btn-sm';
        planBtn.innerHTML = '<i class="bi bi-calendar-plus"></i> Plan Meal';
        planBtn.onclick = () => openPlanMealForm(recipe, planArea);
        planArea.appendChild(planBtn);
        bottomButtonRow.appendChild(planArea);
        body.appendChild(bottomButtonRow);

        card.appendChild(body);
        container.appendChild(card);
    });
}

async function assignRecipeToFolder(recipeId, folderId) {
    console.log(`Assigning recipe ${recipeId} to folder ${folderId}`);

    try {
        if (currentUser) {
            await db.collection('recipes').doc(recipeId).update({ folderId: folderId || null });
        } else {
            await localDB.recipes.update(recipeId, { folderId: folderId || null });
        }

        // --- Instant UI Update ---
        const recipeInMemory = recipes.find(r => r.id === recipeId);
        if (recipeInMemory) {
            recipeInMemory.folderId = folderId;
        }

        const cardElement = document.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
        if (cardElement) {
            const folderNameDisplay = cardElement.querySelector('.folder-name-display');
            const newFolder = folderId ? folders.find(f => f.id === folderId) : null;
            const newFolderName = newFolder ? newFolder.name : 'Uncategorized';
            if (folderNameDisplay) {
                folderNameDisplay.textContent = newFolderName;
                folderNameDisplay.parentElement.title = `Folder: ${newFolderName}`;
            }
        }
        
        renderFolders(); // <-- ADD THIS LINE to refresh the sidebar counts
        showSuccessMessage("Recipe folder updated!");

    } catch (error) {
        console.error("Error assigning recipe to folder:", error);
        alert("Could not update the recipe's folder. Please try again.");
    }
}

async function saveNewRecipeToStorage(recipeDataObject) {
    console.log("saveNewRecipeToStorage called with:", recipeDataObject);
    let success = false;

    const dataToSave = {
        name: recipeDataObject.name || "Untitled Recipe",
        ingredients: recipeDataObject.ingredients || [],
        instructions: recipeDataObject.instructions || "",
        tags: recipeDataObject.tags || [],
        rating: recipeDataObject.rating || 0,
        // Timestamp and UID/localId will be added below
    };

    if (currentUser) {
        dataToSave.uid = currentUser.uid;
        dataToSave.timestamp = firebase.firestore.FieldValue.serverTimestamp();
        try {
            const docRef = await db.collection('recipes').add(dataToSave);
            console.log("✅ New recipe from AI saved to Firestore with ID:", docRef.id);
            showSuccessMessage(`Recipe "${dataToSave.name}" saved to your account!`);
            success = true;
        } catch (error) {
            console.error("❌ Error saving new recipe to Firestore:", error);
            alert("Error saving new recipe: " + error.message);
        }
    } else {
        if (!localDB) {
            alert("Local storage not available. Please sign in to save recipes.");
            return false;
        }
        dataToSave.localId = generateLocalUUID();
        dataToSave.timestamp = new Date().toISOString();
        try {
            await localDB.recipes.add(dataToSave);
            console.log("✅ New recipe from AI saved to LocalDB with localId:", dataToSave.localId);
            showSuccessMessage(`Recipe "${dataToSave.name}" saved locally!`);
            success = true;
        } catch (error) {
            console.error("❌ Error saving new recipe to LocalDB:", error.stack || error);
            alert("Error saving new recipe locally: " + error.message);
        }
    }
    if (success) {
        loadInitialRecipes(); // Refresh the main list
    }
    return success;
}

function hashRecipe(recipe) {
  const { name, ingredients, instructions, tags } = recipe;
  const data = JSON.stringify({ name, ingredients, instructions, tags });
  let hash = 0, i, chr;
  for (i = 0; i < data.length; i++) {
    chr = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}


async function shareRecipe(recipeId) {
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const { id, uid, timestamp, ...shareableData } = recipe;
  const recipeHash = hashRecipe(shareableData);

  const sharedRef = db.collection('sharedRecipes');
  const querySnapshot = await sharedRef.where('hash', '==', recipeHash).limit(1).get();

  let docId;

  if (!querySnapshot.empty) {
    // ✅ Found an existing shared recipe
    docId = querySnapshot.docs[0].id;
  } else {
    // ❌ No existing share — create new
    const docRef = await sharedRef.add({
      ...shareableData,
      hash: recipeHash,
      createdAt: new Date()
    });
    docId = docRef.id;
  }

  const baseUrl = location.hostname.includes('github.io')
    ? 'https://gittster.github.io/Recipe'
    : `${window.location.origin}${window.location.pathname.replace(/\/index\.html$/, '')}`;

  const shareUrl = `${baseUrl}?sharedId=${docId}`;

  if (navigator.share) {
    navigator.share({
      title: recipe.name,
      text: "Check out this recipe!",
      url: shareUrl
    }).then(() => {
      console.log("✅ Shared successfully.");
    }).catch(err => {
      console.error("❌ Share failed:", err);
    });
  } else {
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        const card = document.querySelector(`[data-recipe-id="${recipeId}"]`);
        const shareBtn = card?.querySelector('.btn-share');
        if (!shareBtn) return;

        const message = document.createElement('span');
        message.textContent = '✅ Link copied!';
        message.className = 'text-success fw-semibold';

        shareBtn.replaceWith(message);
        setTimeout(() => {
          message.replaceWith(shareBtn);
        }, 2500);
      });
  }
}







function openPlanMealForm(recipe, container) {
    // Prevent multiple openings
    if (container.querySelector('input[type="date"]')) {
        // If form is already open, perhaps just focus the date input or do nothing
        const existingDateInput = container.querySelector('input[type="date"]');
        if (existingDateInput) existingDateInput.focus();
        return;
    }

    container.innerHTML = ''; // clear the "Plan Meal" button

    const formWrapper = document.createElement('div');
    formWrapper.className = 'plan-meal-inline-form d-flex align-items-center gap-2 p-2 border rounded bg-light-subtle mt-1';


    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'form-control form-control-sm';
    dateInput.style.maxWidth = '150px';
    dateInput.value = new Date().toISOString().split('T')[0]; // Default to today

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-success btn-sm'; // Consistent styling
    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
    saveBtn.title = "Save plan";

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-sm'; // Consistent styling
    cancelBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
    cancelBtn.title = "Cancel";

    formWrapper.appendChild(dateInput);
    formWrapper.appendChild(saveBtn);
    formWrapper.appendChild(cancelBtn);
    container.appendChild(formWrapper);
    dateInput.focus();

    const restorePlanButton = () => {
        container.innerHTML = ''; // Clear the form
        const planBtn = document.createElement('button');
        planBtn.className = 'btn btn-outline-success btn-sm'; // Original button style
        planBtn.textContent = 'Plan Meal';
        planBtn.onclick = () => openPlanMealForm(recipe, container);
        container.appendChild(planBtn);
    };

    saveBtn.onclick = async () => { // Made async for localDB operations
        const selectedDate = dateInput.value;
        if (!selectedDate) {
            dateInput.classList.add('is-invalid'); // Bootstrap validation styling
            setTimeout(() => dateInput.classList.remove('is-invalid'), 2000);
            return;
        }

        const planEntry = {
            date: selectedDate,
            recipeName: recipe.name,
            // recipeId (Firestore) or recipeLocalId (LocalDB) will be set below
        };

        if (currentUser) {
            // --- LOGGED IN: Save to Firebase ---
            planEntry.uid = currentUser.uid; // This line was causing the error when currentUser is null
            planEntry.recipeId = recipe.id; // This is the Firestore Document ID

            try {
                await db.collection("planning").add(planEntry);
                console.log("✅ Meal planned in Firestore:", recipe.name, "on", selectedDate);
                container.innerHTML = '<span class="text-success fw-bold small p-2">✅ Planned!</span>';
                // No need to call loadPlannedMeals() from here if showPlanning() is the main view
                // However, if you want the main Planning page to auto-refresh if it's visible, you could.
            } catch (err) {
                console.error("❌ Failed to plan meal in Firestore:", err);
                container.innerHTML = '<span class="text-danger fw-bold small p-2">❌ Failed</span>';
            }
        } else {
            // --- NOT LOGGED IN: Save to LocalDB ---
            if (!localDB) {
                alert("Local storage not available. Please sign in to plan meals.");
                restorePlanButton(); // Restore button as form submission is effectively cancelled
                return;
            }
            planEntry.localId = generateLocalUUID();
            planEntry.recipeLocalId = recipe.id; // This is the localId from the recipes store

            try {
                await localDB.planning.add(planEntry);
                console.log("✅ Meal planned in LocalDB:", recipe.name, "on", selectedDate);
                container.innerHTML = '<span class="text-success fw-bold small p-2">✅ Planned (Locally)!</span>';
            } catch (err) {
                console.error("❌ Failed to plan meal in LocalDB:", err.stack || err);
                container.innerHTML = '<span class="text-danger fw-bold small p-2">❌ Failed (Local)</span>';
            }
        }
        // After 2 seconds, restore the "Plan Meal" button
        setTimeout(restorePlanButton, 2000);
    };

    cancelBtn.onclick = restorePlanButton;
}



function highlightStars(container, rating) {
  const stars = container.querySelectorAll('i');
  stars.forEach((star, idx) => {
    star.className = idx < rating ? 'bi bi-star-fill text-warning' : 'bi bi-star text-warning';
  });
}

function resetStars(container, rating) {
  const stars = container.querySelectorAll('i');
  stars.forEach((star, idx) => {
    star.className = idx < rating ? 'bi bi-star-fill text-warning' : 'bi bi-star text-warning';
  });
}

function updateRecipeRating(id, rating) {
  db.collection('recipes').doc(id).update({ rating })
    .then(() => {
      console.log(`✅ Rating updated to ${rating} stars`);
      loadRecipesFromFirestore(); // Refresh view
    })
    .catch(err => {
      console.error("❌ Error updating rating:", err);
    });
}

async function openInlineEditor(recipeId, cardElement) {
    if (!cardElement) {
        console.error("Card element not provided to openInlineEditor for recipeId:", recipeId);
        return;
    }
    if (cardElement.querySelector('.inline-editor-content')) {
        console.log("Editor already open for this card:", recipeId);
        return;
    }

    let recipeData;
    let isLocalRecipe = false;

    // --- Step 1: Fetch Recipe Data (Cloud or Local) ---
    if (currentUser) {
        try {
            console.log("Opening editor for Firestore recipe, ID:", recipeId);
            const doc = await db.collection('recipes').doc(recipeId).get();
            if (!doc.exists) {
                alert("Recipe not found in your account.");
                loadInitialRecipes();
                return;
            }
            recipeData = { ...doc.data(), id: doc.id, firestoreId: doc.id };
        } catch (err) {
            console.error("Error fetching recipe from Firestore for editing:", err);
            alert("Failed to load recipe data for editing.");
            return;
        }
    } else {
        if (!localDB) {
            alert("Local storage is not available.");
            return;
        }
        try {
            console.log("Opening editor for local recipe, localId (passed as recipeId):", recipeId);
            const localRecipe = await localDB.recipes.get(recipeId);
            if (!localRecipe) {
                alert("Recipe not found locally.");
                loadInitialRecipes();
                return;
            }
            recipeData = { ...localRecipe, id: localRecipe.localId };
            isLocalRecipe = true;
        } catch (err) {
            console.error("Error fetching recipe from LocalDB for editing:", err.stack || err);
            alert("Failed to load local recipe data for editing.");
            return;
        }
    }

    // --- Step 2: Build the Editor UI ---
    cardElement.innerHTML = ''; // Clear the card's existing content
    const editorContentDiv = document.createElement('div');
    editorContentDiv.className = 'card-body inline-editor-content p-3'; // Keep consistent padding

    // Form Group Styling: Helper function or consistent class
    const createFormGroup = (elements) => {
        const group = document.createElement('div');
        group.className = 'mb-3'; // Standard bottom margin for form groups
        elements.forEach(el => group.appendChild(el));
        return group;
    };

    // Recipe Name
    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-label fw-semibold small'; nameLabel.textContent = 'Recipe Name';
    nameLabel.htmlFor = `editRecipeName-${recipeData.id}`;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'form-control form-control-sm'; nameInput.value = recipeData.name || '';
    nameInput.id = `editRecipeName-${recipeData.id}`;
    editorContentDiv.appendChild(createFormGroup([nameLabel, nameInput]));

    // Ingredients
    const ingLabel = document.createElement('label');
    ingLabel.className = 'form-label fw-semibold small d-block mb-1'; // d-block for full width
    ingLabel.textContent = 'Ingredients';
    editorContentDiv.appendChild(ingLabel);

    const ingredientsTableContainer = document.createElement('div');
    ingredientsTableContainer.className = 'table-responsive mb-2'; // mb-2 before add button
    const ingredientsTableBodyId = `editIngredientsTable-${recipeData.id.replace(/[^a-zA-Z0-9]/g, "")}`;
    ingredientsTableContainer.innerHTML = `
        <table class="table table-sm table-bordered table-ingredients-editor">
            <thead class="table-light">
                <tr>
                    <th>Ingredient</th>
                    <th style="width: 25%;">Qty</th>
                    <th style="width: 25%;">Unit</th>
                    <th style="width: 10%;" class="text-center">Del</th>
                </tr>
            </thead>
            <tbody id="${ingredientsTableBodyId}"></tbody>
        </table>
    `;
    editorContentDiv.appendChild(ingredientsTableContainer);
    const addIngBtn = document.createElement('button');
    addIngBtn.type = 'button';
    addIngBtn.className = 'btn btn-outline-secondary btn-sm mb-3 d-block w-100'; // Full width button
    addIngBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Add Ingredient';
    addIngBtn.onclick = () => addIngredientRowToEditor(ingredientsTableBodyId);
    editorContentDiv.appendChild(addIngBtn);

    // Instructions
    const instrLabel = document.createElement('label');
    instrLabel.className = 'form-label fw-semibold small'; instrLabel.textContent = 'Instructions';
    instrLabel.htmlFor = `editRecipeInstructions-${recipeData.id}`;
    const instructionsInput = document.createElement('textarea');
    instructionsInput.className = 'form-control form-control-sm';
    instructionsInput.rows = 5;
    instructionsInput.id = `editRecipeInstructions-${recipeData.id}`;
    instructionsInput.value = recipeData.instructions || '';
    editorContentDiv.appendChild(createFormGroup([instrLabel, instructionsInput]));

    // Tags
    let currentEditingTags = [...(recipeData.tags || [])];
    const tagsLabel = document.createElement('label');
    tagsLabel.className = 'form-label fw-semibold small'; tagsLabel.textContent = 'Tags';
    tagsLabel.htmlFor = `inlineTagInput-${recipeData.id.replace(/[^a-zA-Z0-9]/g, "")}`;
    editorContentDiv.appendChild(tagsLabel); // Append label first

    const editorInstanceId = recipeData.id.replace(/[^a-zA-Z0-9]/g, "");
    const tagsContainerId = `inlineTagsContainer-${editorInstanceId}`;
    const tagsPlaceholderId = `inlineTagsPlaceholder-${editorInstanceId}`;
    const tagInputId = `inlineTagInput-${editorInstanceId}`;
    const addTagBtnId = `inlineAddTagBtn-${editorInstanceId}`;

    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'mb-3'; // Group for tags input and display
    // Tags Display Area
    const tagsDisplayArea = document.createElement('div');
    tagsDisplayArea.id = tagsContainerId;
    tagsDisplayArea.className = 'form-control form-control-sm d-flex flex-wrap align-items-center gap-1 p-2 position-relative mb-2'; // mb-2 for space before input
    tagsDisplayArea.style.minHeight = '31px'; // Match form-control-sm height
    tagsDisplayArea.style.backgroundColor = '#f8f9fa';
    tagsDisplayArea.style.borderStyle = 'dashed';
    const tagsPlaceholderSpan = document.createElement('span'); // Changed from innerHTML
    tagsPlaceholderSpan.id = tagsPlaceholderId;
    tagsPlaceholderSpan.className = 'text-muted position-absolute small';
    tagsPlaceholderSpan.style.left = '10px';
    tagsPlaceholderSpan.style.top = '50%';
    tagsPlaceholderSpan.style.transform = 'translateY(-50%)';
    tagsPlaceholderSpan.style.pointerEvents = 'none';
    tagsPlaceholderSpan.textContent = 'No tags yet...';
    tagsDisplayArea.appendChild(tagsPlaceholderSpan);
    tagsWrapper.appendChild(tagsDisplayArea);

    // Tags Input Group
    const tagInputGroup = document.createElement('div');
    tagInputGroup.className = 'input-group input-group-sm';
    const tagInputField = document.createElement('input');
    tagInputField.type = 'text';
    tagInputField.id = tagInputId;
    tagInputField.className = 'form-control form-control-sm';
    tagInputField.placeholder = 'Type a tag & press Enter';
    const addTagButtonElement = document.createElement('button');
    addTagButtonElement.type = 'button';
    addTagButtonElement.id = addTagBtnId;
    addTagButtonElement.className = 'btn btn-outline-secondary'; // Consistent with other outline buttons
    addTagButtonElement.innerHTML = '<i class="bi bi-plus"></i> Add';
    tagInputGroup.appendChild(tagInputField);
    tagInputGroup.appendChild(addTagButtonElement);
    tagsWrapper.appendChild(tagInputGroup);
    editorContentDiv.appendChild(tagsWrapper);

    // Append the main editor content to the card BEFORE attaching event listeners to tag elements
    cardElement.appendChild(editorContentDiv);

    // Get tag elements by ID now that they are in the DOM
    const liveTagsContainer = document.getElementById(tagsContainerId);
    const liveTagsPlaceholder = document.getElementById(tagsPlaceholderId);
    const liveTagInput = document.getElementById(tagInputId);
    const liveAddTagButton = document.getElementById(addTagBtnId);

    const renderCurrentEditingTags = () => {
        if (!liveTagsContainer || !liveTagsPlaceholder) return;
        liveTagsContainer.innerHTML = ''; // Clear only badges, keep placeholder if needed
        if (currentEditingTags.length === 0) {
            liveTagsContainer.appendChild(liveTagsPlaceholder); // Re-add placeholder
            liveTagsPlaceholder.style.display = 'block';
        } else {
            liveTagsPlaceholder.style.display = 'none';
            currentEditingTags.forEach(tag => {
                const tagBadge = document.createElement('span');
                tagBadge.className = 'badge bg-primary text-white me-1 mb-1 py-1 px-2 small';
                tagBadge.textContent = tag;
                tagBadge.style.cursor = 'pointer';
                tagBadge.title = 'Click to remove tag';
                tagBadge.onclick = (e) => {
                    e.stopPropagation();
                    currentEditingTags = currentEditingTags.filter(t => t !== tag);
                    renderCurrentEditingTags();
                };
                liveTagsContainer.appendChild(tagBadge);
            });
        }
    };

    const addTagAction = () => {
        if (!liveTagInput) return;
        const value = liveTagInput.value.trim().toLowerCase();
        if (value && !currentEditingTags.includes(value)) {
            currentEditingTags.push(value);
            renderCurrentEditingTags();
        }
        liveTagInput.value = '';
        liveTagInput.focus();
    };

    if (liveAddTagButton) liveAddTagButton.onclick = addTagAction;
    if (liveTagInput) {
        liveTagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTagAction(); }
        });
    }
    renderCurrentEditingTags(); // Initial render

    // Save / Cancel buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'd-flex justify-content-end gap-2 mt-4 pt-3 border-top'; // Added mt-4
    const saveEditBtn = document.createElement('button');
    saveEditBtn.type = 'button';
    saveEditBtn.className = 'btn btn-success btn-sm';
    saveEditBtn.innerHTML = '<i class="bi bi-check-lg"></i> Save Changes';
    const cancelEditBtn = document.createElement('button');
    cancelEditBtn.type = 'button';
    cancelEditBtn.className = 'btn btn-secondary btn-sm';
    cancelEditBtn.innerHTML = '<i class="bi bi-x-lg"></i> Cancel';
    btnRow.appendChild(saveEditBtn);
    btnRow.appendChild(cancelEditBtn);
    editorContentDiv.appendChild(btnRow); // Already part of cardElement

    // Populate ingredient table
    const ingredientsTbody = document.getElementById(ingredientsTableBodyId);
    if (recipeData.ingredients && ingredientsTbody) {
        recipeData.ingredients.forEach(ing => addIngredientRowToEditor(ingredientsTableBodyId, ing.name, ing.quantity, ing.unit));
    }
    if (ingredientsTbody) addIngredientRowToEditor(ingredientsTableBodyId); // Add a blank row

    // --- Save Logic (remains largely the same, ensure using correct variables) ---
    saveEditBtn.onclick = async () => {
    const updatedName = nameInput.value.trim();
    if (!updatedName) {
        alert("Recipe name cannot be empty.");
        nameInput.focus();
        return;
    }

    const updatedIngredients = [];
    if (ingredientsTbody) {
        ingredientsTbody.querySelectorAll('tr').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length >= 3) {
                const ingName = inputs[0].value.trim();
                const ingQty = inputs[1].value.trim();
                const ingUnit = inputs[2].value.trim();
                if (ingName) {
                    updatedIngredients.push({ name: ingName, quantity: ingQty, unit: ingUnit });
                }
            }
        });
    }
    
    // This is our new payload. Notice it does NOT include the original 'timestamp'.
    const dataToUpdate = {
        name: updatedName,
        ingredients: updatedIngredients,
        instructions: instructionsInput.value.trim(),
        tags: [...currentEditingTags],
        // We leave 'rating' and the original 'timestamp' untouched
    };

    try {
        if (currentUser && !isLocalRecipe) {
            // Add a 'lastModified' field for Firestore
            dataToUpdate.lastModified = firebase.firestore.FieldValue.serverTimestamp();
            
            const docIdToUpdate = recipeData.firestoreId || recipeData.id;
            console.log("Updating Firestore recipe, ID:", docIdToUpdate);
            // Use .update() which only changes the fields you provide
            await db.collection('recipes').doc(docIdToUpdate).update(dataToUpdate);
            showSuccessMessage("Recipe updated in your account!");

        } else {
            if (!localDB) { alert("Local storage not available to save changes."); return; }
            
            // Add a 'lastModified' field for LocalDB
            dataToUpdate.lastModified = new Date().toISOString();
            
            console.log("Updating LocalDB recipe, localId:", recipeData.id);
            // .update() for Dexie also only changes the specified fields
            await localDB.recipes.update(recipeData.id, dataToUpdate);
            showSuccessMessage("Local recipe updated!");
        }
        loadInitialRecipes();
    } catch (err) {
        console.error("Error saving recipe changes:", err.stack || err);
        alert("Failed to save changes: " + err.message);
    }
};

    cancelEditBtn.onclick = () => {
        loadInitialRecipes();
    };
}

function addChatMessage(message, sender = 'bot') {
    console.log(`--- addChatMessage START. Sender: ${sender}, Message: "${message}" ---`); // Log 1

    // 'messagesContainer' and 'initialMessage' should be defined in the outer scope 
    // of openRecipeSpecificChatModal where addChatMessage is also defined.
    // If not, they will be undefined here.

    if (!messagesContainer) {
        console.error("addChatMessage: CRITICAL ERROR - messagesContainer is null or undefined!");
        return;
    }
    console.log("addChatMessage: messagesContainer found:", messagesContainer); // Log 2

    // Check for initialMessage and remove it
    // Note: initialMessage might be null if it was already removed or never existed.
    if (initialMessage && messagesContainer.contains(initialMessage) && sender !== 'initial') {
        console.log("addChatMessage: initialMessage found, attempting to remove."); // Log 3
        try {
            initialMessage.remove();
            // Set initialMessage to null after removal to prevent trying to remove it again
            // This requires initialMessage to be a variable accessible in this scope that can be reassigned.
            // If initialMessage was a 'const' in the outer scope, you can't reassign it.
            // A better way might be to re-query for it or just let this logic run once.
            // For now, let's assume it's okay to try removing.
            console.log("addChatMessage: initialMessage removed."); // Log 4
        } catch (e) {
            console.error("addChatMessage: Error removing initialMessage:", e); // Log 4b
        }
    } else if (sender !== 'initial') {
        console.log("addChatMessage: initialMessage not found or already removed, or sender is 'initial'."); // Log 3b
    }


    console.log("addChatMessage: Creating message elements."); // Log 5
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('mb-2', sender === 'user' ? 'text-end' : 'text-start');

    const msgBubble = document.createElement('span');
    msgBubble.classList.add('p-2', 'rounded', 'chat-bubble'); // Added 'chat-bubble' for potential common styling
    msgBubble.classList.add(sender === 'user' ? 'bg-primary' : 'bg-light');
    msgBubble.classList.add(sender === 'user' ? 'text-white' : 'text-dark');
    msgBubble.style.display = 'inline-block';
    msgBubble.style.maxWidth = '80%';
    msgBubble.textContent = message; // Safest for plain text messages

    msgDiv.appendChild(msgBubble);
    console.log("addChatMessage: Message elements created, about to append to messagesContainer."); // Log 6

    messagesContainer.appendChild(msgDiv);
    console.log("addChatMessage: Message appended to messagesContainer."); // Log 7

    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Scroll to bottom
    console.log("--- addChatMessage FINISHED successfully. ---"); // Log 8
}


function addIngredientRowToEditor(tbodyId, name = '', quantity = '', unit = '') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) {
        console.error("Ingredient table body not found for ID:", tbodyId);
        return;
    }

    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td><input class="form-control form-control-sm" value="${name}" placeholder="Ingredient"></td>
        <td><input class="form-control form-control-sm" value="${quantity}" placeholder="Qty"></td>
        <td><input class="form-control form-control-sm" value="${unit}" placeholder="Unit"></td>
        <td class="text-center align-middle">
            <button class="btn btn-sm btn-outline-danger py-0 px-1" title="Delete ingredient" onclick="this.closest('tr').remove()">
                <i class="bi bi-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(newRow);
    if (name === '' && quantity === '' && unit === '') { // If it's a new blank row
        const firstInput = newRow.querySelector('input');
        if (firstInput) firstInput.focus();
    }
}

function addIngredientEditRow(container, name = '', qty = '', unit = '') {
  const row = document.createElement('div');
  row.className = 'd-flex gap-2 mb-2';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Ingredient';
  nameInput.className = 'form-control';
  nameInput.value = name;

  const qtyInput = document.createElement('input');
  qtyInput.type = 'text';
  qtyInput.placeholder = 'Qty';
  qtyInput.className = 'form-control';
  qtyInput.value = qty;

  const unitInput = document.createElement('input');
  unitInput.type = 'text';
  unitInput.placeholder = 'Unit';
  unitInput.className = 'form-control';
  unitInput.value = unit;

  row.appendChild(nameInput);
  row.appendChild(qtyInput);
  row.appendChild(unitInput);

  container.appendChild(row);
}

async function saveInlineEdit(recipeId, nameInput, tagsInput, ingredientsDiv, instructionsInput) {
  const name = nameInput.value.trim();
  const tags = tagsInput.value.trim() ? tagsInput.value.trim().split(',').map(t => t.trim().toLowerCase()) : [];
  const instructions = instructionsInput.value.trim();

  const ingredients = [];
  ingredientsDiv.querySelectorAll('div').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const ingName = inputs[0].value.trim();
    const ingQty = inputs[1].value.trim();
    const ingUnit = inputs[2].value.trim();

    if (ingName) {
      ingredients.push({ name: ingName, quantity: ingQty, unit: ingUnit });
    }
  });

  try {
    await db.collection('recipes').doc(recipeId).update({
      name,
      tags,
      ingredients,
      instructions
    });

    console.log("✅ Recipe updated!");

    await loadRecipesFromFirestore(); // <-- Make sure THIS returns a Promise!

    showRecipeFilter(); // <-- Now re-renders fresh recipes
  } catch (err) {
    console.error("❌ Error saving recipe:", err);
    alert('Failed to save recipe.');
  }
}



function deleteRecipe(id) {
  if (!confirm("Are you sure you want to delete this recipe?")) return;

  if (currentUser) {
    db.collection("recipes").doc(id).delete()
    .then(() => {
        loadRecipesFromFirestore(); // Refresh
    })
    // ... catch ...
} else {
    if (!localDB) return;
    localDB.recipes.delete(id) // id here is the localId
    .then(() => {
        console.log("Recipe deleted from LocalDB:", id);
        loadRecipesFromLocal(); // Refresh
    })
    .catch(err => {
        console.error("❌ Error deleting recipe from LocalDB:", err);
        alert("Failed to delete local recipe.");
        confirmBar.remove();
        buttonElement.style.display = '';
    });
}
}

function confirmDeleteRecipe(id, deleteAreaContainer) { // Renamed 'container' to 'deleteAreaContainer' for clarity
    if (!deleteAreaContainer || deleteAreaContainer.querySelector('.confirm-delete-controls')) {
        // If confirmation is already showing, or container is bad, do nothing
        return;
    }

    const originalDeleteButton = deleteAreaContainer.querySelector('.btn-outline-danger'); // Assuming this is your trash icon button

    if (originalDeleteButton) {
        originalDeleteButton.style.display = 'none'; // HIDE THE ORIGINAL TRASH CAN BUTTON
    }

    const confirmControls = document.createElement('div');
    confirmControls.className = 'confirm-delete-controls d-inline-flex align-items-center gap-2'; // Keep this class unique if needed

    const text = document.createElement('span');
    text.className = 'text-danger fw-semibold small'; // Made text small for compactness
    text.textContent = 'Confirm Delete?';

    const yesBtn = document.createElement('button');
    yesBtn.className = 'btn btn-sm btn-danger py-0 px-1'; // Smaller buttons
    yesBtn.innerHTML = '<i class="bi bi-check-lg"></i> Yes';

    const noBtn = document.createElement('button');
    noBtn.className = 'btn btn-sm btn-secondary py-0 px-1'; // Smaller buttons
    noBtn.innerHTML = '<i class="bi bi-x-lg"></i> No';

    const cleanupAndRestore = () => {
        confirmControls.remove();
        if (originalDeleteButton) {
            originalDeleteButton.style.display = 'inline-block'; // RESTORE THE TRASH CAN BUTTON
        }
    };

    yesBtn.onclick = async () => { // Made async for consistency with other delete functions
        // Show some loading state on the yes button if the delete is slow
        yesBtn.disabled = true;
        yesBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Deleting...';
        noBtn.disabled = true;

        try {
            if (currentUser) {
                await db.collection("recipes").doc(id).delete();
                showSuccessMessage("Recipe deleted from your account.");
            } else if (localDB) {
                await localDB.recipes.delete(id); // id here is localId
                showSuccessMessage("Recipe deleted locally.");
            }
            // Instead of full loadInitialRecipes(), which re-renders everything,
            // find the parent card and remove it for a smoother experience.
            const cardToRemove = deleteAreaContainer.closest('.recipe-card');
            if (cardToRemove) {
                cardToRemove.remove();
            } else {
                loadInitialRecipes(); // Fallback to full reload if card isn't found
            }
            // Check if the list is now empty
            const recipeResultsContainer = document.getElementById('recipeResults');
            if (recipeResultsContainer && recipeResultsContainer.childElementCount === 0) {
                displayRecipes([], 'recipeResults'); // Call with empty array to show "empty" message
            }

        } catch (err) {
            console.error("❌ Error deleting recipe:", err.stack || err);
            alert("Failed to delete recipe: " + err.message);
            cleanupAndRestore(); // Restore UI on failure
        }
        // No need to call cleanupUI explicitly here if the card is removed or page reloaded
        // but if an error occurs before card removal, cleanupUI in catch is good.
    };

    noBtn.onclick = cleanupAndRestore;

    confirmControls.appendChild(text);
    confirmControls.appendChild(yesBtn);
    confirmControls.appendChild(noBtn);
    deleteAreaContainer.appendChild(confirmControls);
}




function saveMadeNote() {
  const notes = document.getElementById('madeNotes').value;

  db.collection("history").add({
    recipe: madeModalRecipe,
    timestamp: new Date().toISOString(),
    notes: notes || '',
    uid: currentUser.uid // 🔥 save the user id
  }).then(() => {
    const modal = bootstrap.Modal.getInstance(document.getElementById('madeModal'));
    modal.hide();
    alert("Recipe marked as made!");
  }).catch((err) => {
    console.error("Failed to save history entry:", err);
    alert("Error saving history.");
  });
}

async function loadRecipesFromFirestore() {
  if (!currentUser) {
    recipes = [];
    showRecipeFilter();
    applyAllRecipeFilters(); // Display the empty state
    return;
  }

  try {
    const snapshot = await db.collection('recipes')
      .where('uid', '==', currentUser.uid)
      .get();
    
    recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      isLocal: false, // Good practice to flag data source
      ...doc.data()
    }));
    
    console.log("Loaded recipes from Firestore:", recipes);
    showRecipeFilter();
    // This is the crucial missing line that tells the app to render the recipes
    applyAllRecipeFilters(); 
  } catch (err) {
    console.error("❌ Error loading recipes from Firestore:", err);
    recipes = [];
    showRecipeFilter();
    applyAllRecipeFilters(); // Also render the empty state if there's an error
  }
}

let ingredientsData = [];

async function showIngredients() {
    const view = document.getElementById('mainView');
    view.innerHTML = `
      <h5 class="mb-3">🧂 Ingredients Repository</h5>
      <input type="text" class="form-control mb-3" id="ingredientSearch" placeholder="Search ingredient..." oninput="filterIngredients()" />
  
      <button class="btn btn-outline-dark mb-3" onclick="toggleAddIngredient()">Add Ingredient</button>
      
      <div id="addIngredientForm" class="mb-4" style="display: none;">
        <div class="card card-body">
          <input class="form-control mb-2" id="newIngName" placeholder="Name" />
          <input class="form-control mb-2" id="newIngComponents" placeholder="Components (comma separated)" />
          <input class="form-control mb-2" id="newIngUnit" placeholder="Unit (e.g. oz, lb)" />
          <input class="form-control mb-2" id="newIngCost" placeholder="Cost (e.g. 1.50)" type="number" step="0.01" />
          <input class="form-control mb-2" id="newIngStore" placeholder="Store URL" />
          <button class="btn btn-outline-dark" onclick="addIngredient()">Add</button>
        </div>
      </div>
  
      <div id="ingredientList"></div>
    `;
  
    await loadIngredientsFromFirestore();
  
    renderIngredientList(ingredientsData);
  }
  

function renderIngredientList(data) {
  const list = document.getElementById('ingredientList');
  list.innerHTML = '';

  if (data.length === 0) {
    list.innerHTML = '<p>No ingredients found.</p>';
    return;
  }

  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';

    const body = document.createElement('div');
    body.className = 'card-body';

    body.innerHTML = `
      <h5 class="card-title text-capitalize">${item.name}</h5>
      ${item.tags && item.tags.length > 0 ? `
        <div class="mb-2">
          ${item.tags.map(tag => `<span class="badge bg-secondary me-1">${tag}</span>`).join('')}
        </div>
      ` : ''}      
      <p>🧬 <strong>Made of:</strong> ${item.components.length ? item.components.join(', ') : '—'}</p>
      <p>📏 <strong>Unit:</strong> ${item.unit}</p>
      <p>💲 <strong>Cost:</strong> $${item.cost.toFixed(2)}</p>
      <a href="${item.store}" class="btn btn-sm btn-outline-dark" target="_blank">🛒 View in Store</a>
    `;

    card.appendChild(body);
    list.appendChild(card);
  });
}

function filterIngredients() {
  const query = document.getElementById('ingredientSearch').value.toLowerCase();
  const filtered = ingredientsData.filter(i => i.name.toLowerCase().includes(query));
  renderIngredientList(filtered);
}

function toggleAddIngredient() {
    const form = document.getElementById('addIngredientForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }
  
function addIngredient() {
  const name = document.getElementById('newIngName').value.trim();
  const components = document.getElementById('newIngComponents').value.split(',').map(c => c.trim()).filter(Boolean);
  const unit = document.getElementById('newIngUnit').value.trim();
  const cost = parseFloat(document.getElementById('newIngCost').value);
  const store = document.getElementById('newIngStore').value.trim();

  if (!name || isNaN(cost) || !unit) {
    alert("Please fill out at least name, unit, and cost.");
    return;
  }

  const newIngredient = {
    name,
    components,
    unit,
    cost,
    store
  };

  db.collection("ingredients").add(newIngredient).then(() => {
    loadIngredientsFromFirestore(); // Refresh after saving
    toggleAddIngredient(); // Hide the form
  }).catch((err) => {
    console.error("Error saving ingredient:", err);
    alert("Failed to save ingredient.");
  });
}
  
function loadIngredientsFromFirestore() {
  db.collection("ingredients").get().then(snapshot => {
    ingredientsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderIngredientList(ingredientsData);
  }).catch(err => {
    console.error("Error loading ingredients:", err);
  });
}

function showPlanning() {
    updatePageTitle("Meal Plan & Shopping");
    setActiveNavButton("plan");

    const view = document.getElementById('mainView');
    if (!view) {
        console.error("mainView element not found for showPlanning");
        return;
    }
    view.className = 'section-planning container py-3';

    // **UPDATED HTML STRUCTURE**
    view.innerHTML = `
        <div class="planned-meals-header mb-3">
            <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center">
                <h4 class="mb-2 mb-sm-0"><i class="bi bi-calendar-week me-2"></i>Planned Meals</h4>
                
                <div class="btn-toolbar" role="toolbar" aria-label="Planned meals actions">
                    <div class="btn-group btn-group-sm w-100" role="group">
                        <button class="btn btn-primary" onclick="showAIWeeklyPlanner()" title="Use AI to generate a weekly plan">
                            <i class="bi bi-robot"></i> Chef Bot
                        </button>
                        <button class="btn btn-outline-info" type="button" data-bs-toggle="collapse" data-bs-target="#planningFiltersCollapse" aria-expanded="false" aria-controls="planningFiltersCollapse" title="Toggle filters for planned meals">
                            <i class="bi bi-funnel-fill"></i> Search
                        </button>
                        <button id="clearAllPlanningBtn" class="btn btn-outline-danger" onclick="confirmClearAllPlanning(this)" title="Clear all planned meals">
                            <i class="bi bi-trash3"></i> Clear All
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="collapse mb-3" id="planningFiltersCollapse">
            <div class="filter-section card card-body bg-light-subtle">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">Filter Planned Meals</h6>
                    <button class="btn btn-outline-secondary btn-sm" type="button" onclick="clearPlanningFilters()" title="Clear all planning filters">
                        <i class="bi bi-x-lg"></i> Clear Filters
                    </button>
                </div>
                <div class="row g-2">
                    <div class="col-md-6 col-lg-4">
                        <label for="planDateRangeStart" class="form-label small mb-1">From Date:</label>
                        <input type="date" class="form-control form-control-sm" id="planDateRangeStart" oninput="applyPlanningFilters()">
                    </div>
                    <div class="col-md-6 col-lg-4">
                        <label for="planDateRangeEnd" class="form-label small mb-1">To Date:</label>
                        <input type="date" class="form-control form-control-sm" id="planDateRangeEnd" oninput="applyPlanningFilters()">
                    </div>
                    <div class="col-lg-4 col-12">
                        <label for="planRecipeNameSearch" class="form-label small mb-1">Search Recipe Name in Plan:</label>
                        <input type="text" class="form-control form-control-sm" id="planRecipeNameSearch" placeholder="Enter recipe name..." oninput="applyPlanningFilters()">
                    </div>
                </div>
            </div>
        </div>

        <div id="plannedMealsList" class="mb-4 list-group">
            </div>

        <hr class="my-4" />

        <div class="shopping-list-header mb-3">
             <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center">
                 <h5 class="mb-2 mb-sm-0"><i class="bi bi-cart3"></i> Shopping List</h5>
                 <div class="btn-toolbar" role="toolbar" aria-label="Shopping list actions">
                     <div class="btn-group btn-group-sm w-100" role="group">
                         <button class="btn btn-primary" onclick="generateShoppingList()" title="Generate list from current plans">
                             <i class="bi bi-list-check"></i> Generate
                         </button>
                         <button id="clearCheckedShoppingListBtn" class="btn btn-outline-success" style="display: none;" onclick="confirmClearCheckedShoppingListItems()" title="Clear checked items from list">
                             <i class="bi bi-check2-square"></i> Checked
                         </button>
                         <button id="clearShoppingListBtn" class="btn btn-outline-danger" onclick="confirmClearShoppingList()" disabled title="Clear entire shopping list">
                             <i class="bi bi-trash2"></i> Clear All
                         </button>
                         <button class="btn btn-outline-secondary" onclick="exportShoppingList()" title="Export or Share List">
                            <i class="bi bi-send"></i> Export
                         </button>
                     </div>
                 </div>
             </div>
         </div>
         
         <div id="shoppingListResults" class="mb-4">
             <div class="list-group-item text-muted text-center">Generate a list from your planned meals.</div>
         </div>
    `;

    // Load Planned Meals (Unchanged - Now called by applyPlanningFilters)
    if (typeof applyPlanningFilters === "function") {
        applyPlanningFilters(); // Loads and renders planned meals initially
    } else {
        console.error("applyPlanningFilters function is not defined.");
        const plannedListDiv = document.getElementById('plannedMealsList');
        if (plannedListDiv) plannedListDiv.innerHTML = '<div class="list-group-item text-danger text-center">Error: Could not load planned meals function.</div>';
    }

    // Load Shopping List (Unchanged)
    if (typeof loadShoppingList === "function") {
        loadShoppingList();
    } else {
        console.error("loadShoppingList function is not defined.");
    }
}


/**
 * Clears all filter inputs for the planning view and re-applies filters (showing all).
 */
function clearPlanningFilters() {
    const dateStartInput = document.getElementById('planDateRangeStart');
    const dateEndInput = document.getElementById('planDateRangeEnd');
    const nameSearchInput = document.getElementById('planRecipeNameSearch');

    if (dateStartInput) dateStartInput.value = '';
    if (dateEndInput) dateEndInput.value = '';
    if (nameSearchInput) nameSearchInput.value = '';

    if (typeof applyPlanningFilters === "function") {
        applyPlanningFilters();
    } else {
        console.error("applyPlanningFilters is not defined. Cannot clear and refresh planning view.");
    }
}

async function exportShoppingList() {
    let currentShoppingList = [];
    
    // 1. Get the current shopping list items from Firebase or LocalDB
    try {
        if (currentUser) {
            const doc = await db.collection("shopping").doc(currentUser.uid).get();
            if (doc.exists && doc.data().ingredients) {
                currentShoppingList = doc.data().ingredients;
            }
        } else if (localDB) {
            const localList = await localDB.shoppingList.get("localUserShoppingList");
            if (localList && localList.ingredients) {
                currentShoppingList = localList.ingredients;
            }
        }
    } catch (error) {
        console.error("Error fetching shopping list for export:", error);
        alert("Could not load shopping list to export.");
        return;
    }

    if (currentShoppingList.length === 0) {
        alert("Your shopping list is empty. Add some items to export.");
        return;
    }

    // 2. Format the list into a clean text string with checkboxes
    const listTitle = "My Recipe Shopping List";
    const listItemsText = currentShoppingList.map(item => {
        const quantity = item.quantity || "";
        const unit = item.unit || "";
        const name = item.name || "Unknown Item";
        // Google Keep uses "[ ]" and "[x]" for checklists
        const checkbox = item.checked ? "[x]" : "[ ]"; 
        return `${checkbox} ${quantity} ${unit} ${name}`.trim();
    }).join('\n');

    const fullTextToShare = `${listTitle}\n--------------------\n${listItemsText}`;

    // 3. Use the Web Share API
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'My Recipe Shopping List',
                text: fullTextToShare,
            });
            console.log('Shopping list shared successfully.');
        } catch (error) {
            console.error('Error sharing shopping list:', error);
        }
    } else {
        // Fallback for desktop or browsers that don't support the Share API
        // We can copy the text to the clipboard and inform the user.
        try {
            await navigator.clipboard.writeText(fullTextToShare);
            showSuccessMessage("Shopping list copied to clipboard!");
        } catch (error) {
            console.error('Error copying text to clipboard:', error);
            alert("Could not copy list to clipboard. This feature may not be supported on your browser.");
        }
    }
}

async function applyPlanningFilters() {
    const listContainer = document.getElementById('plannedMealsList');
    if (!listContainer) {
        console.error("applyPlanningFilters: plannedMealsList container not found.");
        return;
    }
    listContainer.innerHTML = '<div class="list-group-item text-muted text-center">Loading & Filtering Planned Meals... <span class="spinner-border spinner-border-sm"></span></div>';

    // Get filter values
    const dateStartFilter = document.getElementById('planDateRangeStart')?.value;
    const dateEndFilter = document.getElementById('planDateRangeEnd')?.value;
    const nameSearchTerm = document.getElementById('planRecipeNameSearch')?.value.toLowerCase().trim();
    
    let allPlannedMeals = [];

    try {
        if (currentUser) {
            const querySnapshot = await db.collection("planning")
                .where('uid', '==', currentUser.uid)
                .orderBy('date') // Base order by date
                .get();
            if (!querySnapshot.empty) {
                allPlannedMeals = querySnapshot.docs.map(doc => ({ firestoreId: doc.id, id: doc.id, ...doc.data() }));
            }
        } else if (localDB) {
            allPlannedMeals = await localDB.planning.orderBy('date').toArray();
            allPlannedMeals = allPlannedMeals.map(p => ({ ...p, id: p.localId, isLocal: true }));
        } else {
             listContainer.innerHTML = '<div class="alert alert-warning text-center">Local storage not available.</div>';
             return;
        }

        // Apply client-side filters to the fetched 'allPlannedMeals'
        let filteredList = [...allPlannedMeals];

        if (dateStartFilter) {
            filteredList = filteredList.filter(plan => plan.date >= dateStartFilter);
        }
        if (dateEndFilter) {
            // Ensure the end date filter includes the entire day
            const endOfDay = new Date(dateEndFilter + 'T23:59:59.999');
            filteredList = filteredList.filter(plan => {
                const planDate = new Date(plan.date + 'T00:00:00');
                return planDate <= endOfDay;
            });
        }
        if (nameSearchTerm) {
            filteredList = filteredList.filter(plan => 
                plan.recipeName && plan.recipeName.toLowerCase().includes(nameSearchTerm)
            );
        }
        
        const displayOptions = {};
        if (nameSearchTerm) {
            displayOptions.highlightNameTerm = nameSearchTerm; 
        }

        if (typeof renderPlannedMealsList === "function") {
            renderPlannedMealsList(filteredList, displayOptions);
        } else {
            console.error("renderPlannedMealsList function is not defined.");
            listContainer.innerHTML = '<div class="alert alert-danger text-center">Error: Cannot display planned meals.</div>';
        }

    } catch (error) {
        console.error("Error loading/filtering planned meals:", error.stack || error);
        listContainer.innerHTML = '<div class="alert alert-danger text-center">Could not load or filter planned meals.</div>';
    }
}

/**
 * Updates the state when a recipe is selected from the dropdown.
 * @param {HTMLSelectElement} selectElement The dropdown element.
 */
function selectRecipeForDay(selectElement) {
    const day = selectElement.dataset.day;
    const typeId = selectElement.dataset.type; // We still know the context type
    const recipeId = selectElement.value || null; // Get selected recipe ID, or null if "-- Ask Chef Bot --"

    if (currentWeeklyPlan[day]) {
        currentWeeklyPlan[day].recipeId = recipeId;
    } else {
        // This case should ideally not happen if type was selected first
        currentWeeklyPlan[day] = { type: typeId, recipeId: recipeId };
    }
    
    cancelAISuggestions(); // Reset AI suggestions if input changes
    console.log("Current Plan Updated:", currentWeeklyPlan);
}

/**
 * Populates the recipe select dropdown for a specific day and meal type, applying filters.
 * @param {string} day The day of the week.
 * @param {string} typeId The selected meal type ID (e.g., 'cook-quick').
 * @param {string|null} selectedRecipeId The currently selected recipe ID (if any).
 */
function populateRecipeSelector(day, typeId, selectedRecipeId) {
    const selectElement = document.getElementById(`recipe-select-${day}-${typeId}`);
    if (!selectElement) return;

    const mealType = mealTypes.find(mt => mt.id === typeId);
    const filterTag = mealType ? mealType.tag : null;

    // Filter the global 'recipes' list
    let filteredRecipes = recipes;
    if (filterTag) {
        filteredRecipes = recipes.filter(r => r.tags && r.tags.includes(filterTag));
        console.log(`Filtering recipes for tag '${filterTag}', found ${filteredRecipes.length}`);
    } else {
         // No specific tag, maybe exclude 'leftovers' tag? Optional.
         // filteredRecipes = recipes.filter(r => !r.tags || !r.tags.includes('leftovers')); 
    }

    // Sort filtered recipes alphabetically
    filteredRecipes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Populate the dropdown
    selectElement.innerHTML = '<option value="">-- Ask Chef Bot --</option>'; // Default option
    filteredRecipes.forEach(recipe => {
        const option = document.createElement('option');
        option.value = recipe.id; // Use Firestore ID or localId
        option.textContent = recipe.name;
        option.selected = recipe.id === selectedRecipeId; // Pre-select if needed
        selectElement.appendChild(option);
    });
}

async function addPlannedMeal() { // Made async
    const date = document.getElementById('planDate').value;
    const recipeId = document.getElementById('planRecipe').value; // This will be Firestore ID or localId

    if (!date || !recipeId) {
        alert("Please select a date and a recipe!");
        return;
    }

    // Find the recipe object from the global 'recipes' array
    const selectedRecipe = recipes.find(r => r.id === recipeId);

    if (!selectedRecipe) {
        alert("Selected recipe not found. Please refresh.");
        return;
    }

    const planEntry = {
        date,
        recipeName: selectedRecipe.name,
        // 'recipeId' will store Firestore ID if logged in, 'recipeLocalId' will store localId if not
    };

    if (currentUser) {
        // --- LOGGED IN: Save to Firebase ---
        planEntry.uid = currentUser.uid;
        planEntry.recipeId = selectedRecipe.id; // This is the Firestore Document ID

        try {
            await db.collection("planning").add(planEntry);
            console.log("✅ Meal added to Firestore planning:", selectedRecipe.name);
            showSuccessMessage("Meal planned successfully!");
            loadPlannedMeals(); // Refresh list
        } catch (err) {
            console.error("❌ Error adding to Firestore planning:", err);
            alert("Error planning meal: " + err.message);
        }
    } else {
        // --- NOT LOGGED IN: Save to LocalDB ---
        if (!localDB) {
            alert("Local storage not available. Please sign in to plan meals.");
            return;
        }
        planEntry.localId = generateLocalUUID();
        planEntry.recipeLocalId = selectedRecipe.id; // This is the localId from the recipes store

        try {
            await localDB.planning.add(planEntry);
            console.log("✅ Meal added to LocalDB planning:", selectedRecipe.name);
            showSuccessMessage("Meal planned locally!");
            loadPlannedMeals(); // Refresh list
        } catch (err) {
            console.error("❌ Error adding to LocalDB planning:", err.stack || err);
            alert("Error planning meal locally: " + err.message);
        }
    }
}


async function loadPlannedMeals() { // Made async
    const listContainer = document.getElementById('plannedMealsList');
    if (!listContainer) return;
    listContainer.innerHTML = '<div class="list-group-item text-muted">Loading planned meals...</div>';

    if (currentUser) {
        // --- LOGGED IN: Load from Firebase ---
        try {
            const snapshot = await db.collection("planning")
                .where('uid', '==', currentUser.uid)
                .orderBy('date') // Then perhaps by recipeName or an added timestamp
                .get();

            if (snapshot.empty) {
                listContainer.innerHTML = '<div class="list-group-item text-muted text-center">No meals planned yet.</div>';
                return;
            }
            const plannedMeals = snapshot.docs.map(doc => ({ firestoreId: doc.id, ...doc.data() }));
            renderPlannedMealsList(plannedMeals.map(p => ({ ...p, id: p.firestoreId })));
        } catch (err) {
            console.error("Error loading planning from Firestore:", err);
            listContainer.innerHTML = '<div class="list-group-item text-danger text-center">Error loading planned meals.</div>';
        }
    } else {
        // --- NOT LOGGED IN: Load from LocalDB ---
        if (!localDB) {
            listContainer.innerHTML = '<div class="list-group-item text-warning text-center">Local storage not available.</div>';
            return;
        }
        try {
            const plannedMeals = await localDB.planning.orderBy('date').toArray();
            if (!plannedMeals || plannedMeals.length === 0) {
                listContainer.innerHTML = '<div class="list-group-item text-muted text-center">No meals planned locally yet.</div>';
                return;
            }
            renderPlannedMealsList(plannedMeals.map(p => ({ ...p, id: p.localId })));
        } catch (err) {
            console.error("Error loading planning from LocalDB:", err.stack || err);
            listContainer.innerHTML = '<div class="list-group-item text-danger text-center">Error loading local planned meals.</div>';
        }
    }
}

/**
 * Helper function to format ingredients and instructions into a plain text string.
 * @param {Array<Object>} ingredients - The recipe's ingredients array.
 * @param {string} instructions - The recipe's instructions string.
 * @returns {string} A formatted string for the calendar description.
 */
function formatRecipeForCalendar(ingredients, instructions) {
    let description = "--- INGREDIENTS ---\n";
    
    if (ingredients && ingredients.length > 0) {
        description += ingredients.map(ing => {
            // Creates a line like "- 1 cup All-Purpose Flour"
            return `- ${ing.quantity || ''} ${ing.unit || ''} ${ing.name || 'Unknown'}`.trim();
        }).join('\n');
    } else {
        description += "No ingredients listed.\n";
    }
    
    description += "\n\n--- INSTRUCTIONS ---\n";
    description += instructions || "No instructions provided.";
    
    return description;
}

/**
 * Creates and opens a Google Calendar link for a specific planned meal.
 * @param {Object} planEntry - The planned meal object (from 'planning' collection/table).
 */
async function exportMealToGoogleCalendar(planEntry) {
    const recipeIdToFind = planEntry.recipeId || planEntry.recipeLocalId;
    
    // Find the full recipe object in the global recipes array (which holds all loaded recipes)
    const recipe = recipes.find(r => r.id === recipeIdToFind);

    if (!recipe) {
        console.error("Recipe not found for planned entry:", planEntry);
        showInfoConfirmModal("Error", "Could not find the full recipe details to export to a calendar. Please ensure the recipe still exists in your list.", [{ text: 'OK', class: 'btn-primary', dismiss: true }]);
        return;
    }
    
    // --- NEW: Load saved time preference ---
    let defaultTime = '18:00'; // 6:00 PM as fallback
    if (currentUser) {
        try {
            const userRef = db.collection('users').doc(currentUser.uid);
            const userDoc = await userRef.get();
            if (userDoc.exists && userDoc.data().preferences?.defaultCalendarTime) {
                defaultTime = userDoc.data().preferences.defaultCalendarTime;
            }
        } catch (error) {
            console.warn("Could not fetch user's default time, using 18:00.", error);
        }
    }
    // --- END NEW BLOCK ---

    const title = recipe.name || "My Meal";
    const description = formatRecipeForCalendar(recipe.ingredients, recipe.instructions);
    
    const planDate = planEntry.date; // e.g., "2025-10-27"
    
    // Create date object using the planDate and the (potentially user-defined) defaultTime
    const localEventStart = new Date(`${planDate}T${defaultTime}:00`);
    const localEventEnd = new Date(localEventStart.getTime() + 60 * 60 * 1000); // Add 1 hour
    
    // Convert to ISO string (UTC) and format for Google Calendar
    const utcStartDate = localEventStart.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const utcEndDate = localEventEnd.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dates = `${utcStartDate}/${utcEndDate}`;

    const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dates}&details=${encodeURIComponent(description)}`;

    console.log("Opening Google Calendar URL:", googleCalendarUrl);
    window.open(googleCalendarUrl, '_blank');
}

function renderPlannedMealsList(plannedEntries, options = {}) {
    const listContainer = document.getElementById('plannedMealsList');
    if (!listContainer) {
        console.error("renderPlannedMealsList: listContainer not found");
        return;
    }
    
    listContainer.innerHTML = ''; // Clear previous items or loading message

    if (!plannedEntries || plannedEntries.length === 0) {
         listContainer.innerHTML = `<div class="list-group-item text-muted text-center">No meals planned for this period.</div>`;
        return;
    }
     
    // Group by date
    const mealsByDate = plannedEntries.reduce((acc, entry) => {
        const date = entry.date;
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(entry);
        return acc;
    }, {});

    const sortedDates = Object.keys(mealsByDate).sort();
    const nameRegex = options.highlightNameTerm ? createHighlightRegex(options.highlightNameTerm) : null;
    const highlightTermLower = options.highlightNameTerm ? options.highlightNameTerm.toLowerCase() : null;

    for (const date of sortedDates) {
        const dateHeader = document.createElement('h6');
        dateHeader.className = 'mt-3 mb-2 text-primary fw-bold ps-1 d-flex align-items-center';
        
        const displayDate = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
        
        dateHeader.textContent = displayDate;
        listContainer.appendChild(dateHeader);

        mealsByDate[date].forEach(entry => {
            const li = document.createElement('div');
            li.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center mb-1 rounded';

            const info = document.createElement('span');
            const recipeName = entry.recipeName || "Unnamed Meal";
            
            // Safely check for highlighting
            if (nameRegex && highlightTermLower && recipeName.toLowerCase().includes(highlightTermLower)) {
                info.innerHTML = recipeName.replace(nameRegex, '<mark>$1</mark>');
            } else {
                info.textContent = recipeName;
            }

            // Container for the action buttons
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'd-flex align-items-center gap-2';

            // --- NEW: Export to Calendar Button ---
            const calendarBtn = document.createElement('button');
            calendarBtn.className = 'btn btn-outline-primary btn-sm py-0 px-1';
            calendarBtn.innerHTML = '<i class="bi bi-calendar-plus"></i>';
            calendarBtn.title = `Export "${recipeName}" to Google Calendar`;
            calendarBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent any parent click listeners
                exportMealToGoogleCalendar(entry); // Call the new export function
            };
            buttonContainer.appendChild(calendarBtn);
            // --- End New Button ---

            // Delete button
            const deleteBtnContainer = document.createElement('div');
            deleteBtnContainer.className = 'delete-planned-meal-area';
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-outline-danger btn-sm py-0 px-1';
            deleteBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
            deleteBtn.title = `Remove ${recipeName} from ${date}`;
            deleteBtn.onclick = () => confirmDeletePlannedMeal(entry.id, deleteBtnContainer, li);
            
            deleteBtnContainer.appendChild(deleteBtn);
            buttonContainer.appendChild(deleteBtnContainer); // Add delete button to the container

            li.appendChild(info);
            li.appendChild(buttonContainer); // Add the container with both buttons
            listContainer.appendChild(li);
        });
    }
}

// script.js

/**
 * Helper function to format a YYYY-MM-DD date into YYYYMMDD format for Google Calendar.
 * @param {string} dateString - The date in "YYYY-MM-DD" format.
 * @returns {string} The date in "YYYYMMDD" format.
 */
function formatDateForGoogleCalendar(dateString) {
    return dateString.replace(/-/g, '');
}

/**
 * Creates and opens a Google Calendar link for a specific day's meal plan.
 * @param {string} date - The date of the plan (YYYY-MM-DD).
 * @param {Array<Object>} meals - The array of meal (planEntry) objects for that day.
 */
function exportDayToGoogleCalendar(date, meals) {
    console.log(`Exporting meals for ${date}:`, meals);

    // Format the title, e.g., "Meal Plan (2 Recipes)"
    const title = `Meal Plan (${meals.length} Recipe${meals.length > 1 ? 's' : ''})`;

    // Format the description with one meal per line
    const details = meals.map(meal => {
        return `- ${meal.recipeName}`;
    }).join('\n'); // Use newline character for the description

    // Format the dates for an all-day event
    // Google all-day events start on one day and end on the *next* day.
    const startDate = formatDateForGoogleCalendar(date);
    
    // Get the next day
    const localStartDate = new Date(date + 'T00:00:00'); // Treat as local timezone
    const nextDay = new Date(localStartDate.getTime() + 24 * 60 * 60 * 1000); // Add 24 hours
    
    // Format the next day as YYYY-MM-DD, then YYYYMMDD
    const nextDayISO = nextDay.toISOString().split('T')[0];
    const endDate = formatDateForGoogleCalendar(nextDayISO);

    // Build the URL
    const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDate}/${endDate}&details=${encodeURIComponent(details)}`;

    console.log("Opening Google Calendar URL:", googleCalendarUrl);
    window.open(googleCalendarUrl, '_blank');
}

function confirmDeletePlannedMeal(planId, deleteAreaContainer, listItemElement) {
    if (!deleteAreaContainer || deleteAreaContainer.querySelector('.confirm-delete-plan-controls')) return;

    const originalButton = deleteAreaContainer.querySelector('button');
    if (originalButton) originalButton.style.display = 'none';

    const confirmControls = document.createElement('div');
    confirmControls.className = 'confirm-delete-plan-controls d-flex align-items-center gap-1'; // Smaller gap

    const confirmText = document.createElement('span');
    confirmText.className = 'text-danger small me-1';
    confirmText.textContent = 'Del?'; // Shorter confirm text

    const yesBtn = document.createElement('button');
    yesBtn.className = 'btn btn-danger btn-sm py-0 px-1';
    yesBtn.innerHTML = '<i class="bi bi-check-lg"></i>';

    const noBtn = document.createElement('button');
    noBtn.className = 'btn btn-secondary btn-sm py-0 px-1';
    noBtn.innerHTML = '<i class="bi bi-x-lg"></i>';

    const cleanupConfirmationUI = () => {
        confirmControls.remove();
        if (originalButton) originalButton.style.display = '';
    };

    yesBtn.onclick = async () => { // Made async
        if (currentUser) {
            // --- LOGGED IN: Delete from Firebase ---
            try {
                await db.collection("planning").doc(planId).delete();
                console.log("✅ Meal removed from Firestore plan:", planId);
                listItemElement.remove(); // Optimistic UI update
                showSuccessMessage("Planned meal removed.");
            } catch (err) {
                console.error("❌ Error removing planned meal from Firestore:", err);
                alert("Error removing planned meal: " + err.message);
                cleanupConfirmationUI();
            }
        } else {
            // --- NOT LOGGED IN: Delete from LocalDB ---
            if (!localDB) {
                alert("Local storage not available.");
                cleanupConfirmationUI();
                return;
            }
            try {
                await localDB.planning.delete(planId); // planId is localId here
                console.log("✅ Meal removed from LocalDB plan:", planId);
                listItemElement.remove(); // Optimistic UI update
                showSuccessMessage("Locally planned meal removed.");
            } catch (err) {
                console.error("❌ Error removing planned meal from LocalDB:", err.stack || err);
                alert("Error removing local planned meal: " + err.message);
                cleanupConfirmationUI();
            }
        }
    };

    noBtn.onclick = cleanupConfirmationUI;

    confirmControls.appendChild(confirmText);
    confirmControls.appendChild(yesBtn);
    confirmControls.appendChild(noBtn);
    deleteAreaContainer.appendChild(confirmControls);
}

async function generateShoppingList() { // Made async
    const outputContainer = document.getElementById('shoppingListResults');
    if (!outputContainer) return;
    outputContainer.innerHTML = '<div class="list-group-item text-muted">Generating shopping list... <span class="spinner-border spinner-border-sm"></span></div>';
    document.getElementById('clearShoppingListBtn').disabled = true;


    const ingredientMap = {}; // To aggregate ingredients

    if (currentUser) {
        // --- LOGGED IN: Generate from Firestore planned meals ---
        try {
            const planningSnapshot = await db.collection("planning")
                .where('uid', '==', currentUser.uid)
                .get();

            if (planningSnapshot.empty) {
                outputContainer.innerHTML = '<div class="list-group-item text-muted text-center">No meals planned in your account to generate a list from.</div>';
                return;
            }

            const recipeIds = planningSnapshot.docs.map(doc => doc.data().recipeId);

            // Ensure `recipes` array (loaded from Firestore) is available
            if (!recipes || recipes.length === 0) {
                console.warn("Firestore recipes not loaded, attempting to reload for shopping list.");
                await loadRecipesFromFirestore(); // Make sure loadRecipesFromFirestore is async and populates `recipes`
                if (!recipes || recipes.length === 0) {
                     outputContainer.innerHTML = '<p class="text-danger text-center">Could not load recipe details for shopping list.</p>';
                     return;
                }
            }
            
            recipeIds.forEach(id => {
                const recipe = recipes.find(r => r.id === id); // r.id is Firestore doc ID
                if (recipe && recipe.ingredients) {
                    recipe.ingredients.forEach(ing => {
                        const key = `${ing.name}|${ing.unit}`.toLowerCase();
                        const qty = parseFloat(ing.quantity) || 0;
                        if (!ingredientMap[key]) {
                            ingredientMap[key] = { ...ing, quantity: qty, checked: false };
                        } else {
                            ingredientMap[key].quantity += qty;
                        }
                    });
                }
            });

            const aggregatedIngredients = Object.values(ingredientMap);
            renderShoppingList(aggregatedIngredients); // Your existing function

            // Save to Firestore shopping collection
            await db.collection("shopping").doc(currentUser.uid).set({
                ingredients: aggregatedIngredients,
                uid: currentUser.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log("✅ Shopping list saved to Firestore for user", currentUser.uid);
            if (aggregatedIngredients.length > 0) {
                document.getElementById('clearShoppingListBtn').disabled = false;
            }

        } catch (err) {
            console.error("❌ Error generating shopping list from Firestore:", err);
            outputContainer.innerHTML = '<p class="text-danger text-center">Error generating shopping list.</p>';
        }

    } else {
        // --- NOT LOGGED IN: Generate from LocalDB planned meals ---
        if (!localDB) {
            outputContainer.innerHTML = '<p class="text-warning text-center">Local storage not available.</p>';
            return;
        }
        try {
            const localPlannedMeals = await localDB.planning.toArray(); // Get all local planned meals

            if (!localPlannedMeals || localPlannedMeals.length === 0) {
                outputContainer.innerHTML = '<div class="list-group-item text-muted text-center">No meals planned locally to generate a list from.</div>';
                return;
            }

            // Ensure `recipes` array (loaded from LocalDB) is available
            if (!recipes || recipes.length === 0) {
                 console.warn("Local recipes not loaded, attempting to reload for shopping list.");
                 await loadRecipesFromLocal(); // Make sure this is async and populates `recipes`
                 if (!recipes || recipes.length === 0) {
                     outputContainer.innerHTML = '<p class="text-danger text-center">Could not load local recipe details for shopping list.</p>';
                     return;
                 }
            }

            localPlannedMeals.forEach(plan => {
                // plan.recipeLocalId is the key to find the recipe in the local `recipes` store
                // (remember recipes loaded locally have their `localId` mapped to `id`)
                const recipe = recipes.find(r => r.id === plan.recipeLocalId);
                if (recipe && recipe.ingredients) {
                    recipe.ingredients.forEach(ing => {
                        const key = `${ing.name}|${ing.unit}`.toLowerCase();
                        // Ensure quantity is parsed correctly, default to 0 if not a number
                        let qtyToAdd = 0;
                        if (typeof ing.quantity === 'string' && ing.quantity.includes('/')) {
                            // Basic fraction handling e.g., "1/2" -> 0.5, "1 1/2" -> 1.5
                            // This can be made more robust if needed
                            try {
                                qtyToAdd = ing.quantity.split(' ').reduce((acc, part) => {
                                    const fractionParts = part.split('/');
                                    return acc + (fractionParts.length === 2 ? parseFloat(fractionParts[0]) / parseFloat(fractionParts[1]) : parseFloat(part) || 0);
                                }, 0);
                            } catch { qtyToAdd = 0; }
                        } else {
                            qtyToAdd = parseFloat(ing.quantity) || 0;
                        }
                        
                        if (!ingredientMap[key]) {
                            ingredientMap[key] = { ...ing, quantity: qtyToAdd, checked: false };
                        } else {
                            ingredientMap[key].quantity += qtyToAdd;
                        }
                    });
                }
            });

            const aggregatedIngredients = Object.values(ingredientMap);
            renderShoppingList(aggregatedIngredients); // Your existing function

            // Save to LocalDB shoppingList store
            // We'll overwrite the existing local list (assuming only one for anonymous user)
            // Using a known ID/name for the single local list, or just clearing and adding.
            // For simplicity, let's clear and add.
            await localDB.shoppingList.clear(); // Clear any old list
            if (aggregatedIngredients.length > 0) {
                await localDB.shoppingList.add({
                    id: "localUserShoppingList", // Use a fixed ID
                    name: "My Local Shopping List", 
                    ingredients: aggregatedIngredients,
                    updatedAt: new Date().toISOString()
                });
                document.getElementById('clearShoppingListBtn').disabled = false;
            }
            console.log("✅ Shopping list saved to LocalDB.");

        } catch (err) {
            console.error("❌ Error generating shopping list from LocalDB:", err.stack || err);
            outputContainer.innerHTML = '<p class="text-danger text-center">Error generating local shopping list.</p>';
        }
    }
}

function confirmClearAllPlanning(button) { // Renamed to reflect it shows a confirmation
    const existingConfirm = button.parentElement.querySelector('.confirm-clear-all-planning');
    if (existingConfirm) {
        existingConfirm.remove(); // Remove if already there
        button.style.display = 'inline-block'; // Show original button
        return;
    }
    
    button.style.display = 'none'; // Hide original button

    const confirmArea = document.createElement('span'); // Use span for inline display next to where button was
    confirmArea.className = 'confirm-clear-all-planning ms-2'; // Added margin

    const confirmText = document.createElement('span');
    confirmText.className = 'text-danger fw-semibold me-2 small';
    confirmText.textContent = 'Delete ALL planned meals?';

    const yesBtn = document.createElement('button');
    yesBtn.className = 'btn btn-sm btn-danger me-1';
    yesBtn.innerHTML = '<i class="bi bi-check-lg"></i> Yes, Clear All';

    const noBtn = document.createElement('button');
    noBtn.className = 'btn btn-sm btn-secondary';
    noBtn.innerHTML = '<i class="bi bi-x-lg"></i> No';

    const cleanupAndRestore = () => {
        confirmArea.remove();
        button.style.display = 'inline-block'; // Show original button
    };

    yesBtn.onclick = async () => { // Made async
        if (currentUser) {
            // --- LOGGED IN: Clear Firebase planning for this user ---
            try {
                const snapshot = await db.collection("planning").where('uid', '==', currentUser.uid).get();
                const batch = db.batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                console.log("✅ All Firestore planning cleared for user.");
                showSuccessMessage("All planned meals cleared from your account.");
                loadPlannedMeals(); // Refresh the list
            } catch (err) {
                console.error("❌ Error clearing Firestore planning:", err);
                alert("Error clearing planned meals: " + err.message);
            } finally {
                cleanupAndRestore();
            }
        } else {
            // --- NOT LOGGED IN: Clear LocalDB planning ---
            if (!localDB) {
                alert("Local storage not available.");
                cleanupAndRestore();
                return;
            }
            try {
                await localDB.planning.clear(); // Clears the entire 'planning' object store
                console.log("✅ All LocalDB planning cleared.");
                showSuccessMessage("All locally planned meals cleared.");
                loadPlannedMeals(); // Refresh the list
            } catch (err) {
                console.error("❌ Error clearing LocalDB planning:", err.stack || err);
                alert("Error clearing local planned meals: " + err.message);
            } finally {
                cleanupAndRestore();
            }
        }
    };

    noBtn.onclick = cleanupAndRestore;

    confirmArea.appendChild(confirmText);
    confirmArea.appendChild(yesBtn);
    confirmArea.appendChild(noBtn);
    button.parentElement.appendChild(confirmArea);
}

async function openUserSettingsModal() {
    if (!userSettingsModalInstance || !currentUser) return;

    const statusDiv = document.getElementById('settingsSaveStatus');
    if (statusDiv) statusDiv.textContent = ''; // Clear status

    // Get current preferences from Firestore to populate the form
    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const userDoc = await userRef.get();
        
        if (userDoc.exists && userDoc.data().preferences) {
            const prefs = userDoc.data().preferences;
            
            // Set the saved sort order
            const sortSelect = document.getElementById('defaultSortOrder');
            if (sortSelect) sortSelect.value = prefs.recipeSortOrder || 'all';
            
            // Set the saved calendar time
            const timeInput = document.getElementById('defaultCalendarTime');
            if (timeInput) timeInput.value = prefs.defaultCalendarTime || '18:00'; // Default to 18:00
            
        } else {
            // No preferences saved yet, set to defaults
            document.getElementById('defaultSortOrder').value = 'all';
            document.getElementById('defaultCalendarTime').value = '18:00';
        }
        
        userSettingsModalInstance.show();
        
    } catch (error) {
        console.error("Error loading user settings:", error);
        alert("Could not load your settings. " + error.message);
    }
}

async function saveUserSettings() {
    if (!currentUser) return;

    const sortSelect = document.getElementById('defaultSortOrder');
    const timeInput = document.getElementById('defaultCalendarTime');
    const statusDiv = document.getElementById('settingsSaveStatus');

    const newSortOrder = sortSelect.value;
    const newCalendarTime = timeInput.value; // e.g., "18:00"

    const newPreferences = {
        recipeSortOrder: newSortOrder,
        defaultCalendarTime: newCalendarTime
    };

    if (statusDiv) {
        statusDiv.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    }

    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        // Use .set with merge:true to update/create the preferences field
        await userRef.set({
            preferences: newPreferences
        }, { merge: true });

        // Update the app's current state
        currentSortOrder = newSortOrder;
        
        if (statusDiv) {
            statusDiv.textContent = '✅ Saved!';
        }
        
        // Hide modal after a short delay
        setTimeout(() => {
            userSettingsModalInstance.hide();
            // We need to re-render the recipe list if the sort order changed
            applyAllRecipeFilters(); // This will use the new currentSortOrder
            renderSortOptions(); // This will update the sidebar highlight
        }, 1000);

    } catch (error) {
        console.error("Error saving user settings:", error);
        if (statusDiv) {
            statusDiv.textContent = '❌ Error saving.';
        }
    }
}

function deletePlannedMeal(planId, button) {
  if (button.parentElement.querySelector('.confirm-delete')) return;

  button.style.display = 'none';

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-delete d-flex gap-2 align-items-center';

  const confirmText = document.createElement('span');
  confirmText.textContent = 'Confirm?';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-danger';
  yesBtn.textContent = 'Yes';
  yesBtn.onclick = () => {
    db.collection("planning").doc(planId).delete()
      .then(() => {
        console.log("✅ Meal removed from plan:", planId);
        loadPlannedMeals(); // Refresh list
      })
      .catch(err => {
        console.error("❌ Error removing planned meal:", err);
        // 🛠 Restore the delete button if error
        confirmArea.remove();
        button.style.display = '';
      });
  };

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-dark';
  noBtn.textContent = 'No';
  noBtn.onclick = () => {
    confirmArea.remove();
    button.style.display = ''; // 🛠 Restore delete button
  };

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);

  button.parentElement.appendChild(confirmArea);
}

function renderShoppingList(ingredients) {
    const outputContainer = document.getElementById('shoppingListResults');
    const clearBtn = document.getElementById('clearShoppingListBtn'); // To enable/disable it

    if (!outputContainer) {
        console.error("Shopping list output container not found!");
        return;
    }
    outputContainer.innerHTML = ''; // Clear previous list or messages

    if (!ingredients || ingredients.length === 0) {
        outputContainer.innerHTML = '<div class="list-group-item text-muted text-center">Your shopping list is empty. Generate one from planned meals!</div>';
        if (clearBtn) clearBtn.disabled = true;
        return;
    }

    const listGroup = document.createElement('ul');
    listGroup.className = 'list-group shopping-list-group'; // Added custom class for potential styling

    // Helper function to update the persisted shopping list
    const updatePersistedShoppingList = async (updatedIngredients) => {
        if (currentUser) {
            // --- LOGGED IN: Update Firestore ---
            try {
                await db.collection("shopping").doc(currentUser.uid).set({
                    ingredients: updatedIngredients,
                    uid: currentUser.uid,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log("Firestore shopping list updated.");
            } catch (err) {
                console.error("Error updating Firestore shopping list:", err);
                alert("Could not save changes to your shopping list. Please try again.");
                // Optionally, you might want to revert the UI change if saving fails.
            }
        } else {
            // --- NOT LOGGED IN: Update LocalDB ---
            if (!localDB) {
                console.error("LocalDB not initialized. Cannot update local shopping list.");
                alert("Local storage not available to save shopping list changes.");
                return;
            }
            try {
                // Assuming a single shopping list document with a fixed ID for anonymous users
                await localDB.shoppingList.put({
                    id: "localUserShoppingList",
                    name: "My Local Shopping List",
                    ingredients: updatedIngredients,
                    updatedAt: new Date().toISOString()
                });
                console.log("LocalDB shopping list updated.");
            } catch (err) {
                console.error("Error updating LocalDB shopping list:", err.stack || err);
                alert("Could not save changes to your local shopping list. Please try again.");
            }
        }
        // Update the state of the "Clear Shopping List" button
        if (clearBtn) {
            clearBtn.disabled = updatedIngredients.length === 0;
        }
    };

    ingredients.forEach((ing, index) => {
        const item = document.createElement('li');
        item.className = 'list-group-item d-flex justify-content-between align-items-center shopping-list-item';
        // Use a unique key for data-attribute if needed, though index works for direct manipulation here
        item.dataset.index = index;

        const leftSide = document.createElement('div');
        leftSide.className = 'd-flex align-items-center form-check'; // Using form-check for better alignment

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input me-2'; // Bootstrap class for checkboxes
        checkbox.checked = ing.checked || false; // Default to false if undefined
        checkbox.id = `shopping-item-${index}`; // Unique ID for label association

        const label = document.createElement('label');
        label.className = 'form-check-label shopping-item-label';
        label.htmlFor = `shopping-item-${index}`; // Associate label with checkbox
        // Format quantity nicely (e.g., handle whole numbers without decimals if they are .0)
        let displayQuantity = ing.quantity;
        if (typeof ing.quantity === 'number' && ing.quantity % 1 === 0) {
            displayQuantity = ing.quantity; // Keep as whole number
        } else if (typeof ing.quantity === 'number') {
            displayQuantity = ing.quantity.toFixed(2).replace(/\.00$/, ''); // Show up to 2 decimals, remove trailing .00
        }
        label.textContent = `${displayQuantity} ${ing.unit || ''} ${ing.name}`;

        if (checkbox.checked) {
            label.style.textDecoration = 'line-through';
            label.style.opacity = '0.6';
        }

        leftSide.appendChild(checkbox);
        leftSide.appendChild(label);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-outline-danger btn-sm py-0 px-1 shopping-item-delete-btn';
        deleteBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
        deleteBtn.title = `Remove ${ing.name}`;

        // Event listener for checkbox change
        checkbox.addEventListener('change', () => {
            ingredients[index].checked = checkbox.checked;
            if (checkbox.checked) {
                label.style.textDecoration = 'line-through';
                label.style.opacity = '0.6';
            } else {
                label.style.textDecoration = 'none';
                label.style.opacity = '1';
            }
            updatePersistedShoppingList([...ingredients]); // Pass a copy of the array
        });

        // Event listener for clicking the label or item area (excluding the delete button)
        // to toggle the checkbox
        item.addEventListener('click', (e) => {
            // Prevent toggling if the click was on the delete button itself or the checkbox input
            if (e.target === deleteBtn || e.target.closest('.shopping-item-delete-btn') === deleteBtn || e.target === checkbox) {
                return;
            }
            checkbox.checked = !checkbox.checked;
            // Manually trigger the 'change' event on the checkbox so its listener fires
            checkbox.dispatchEvent(new Event('change'));
        });

        // Event listener for delete button
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent item click listener from firing
            ingredients.splice(index, 1); // Remove item from the array
            renderShoppingList(ingredients); // Re-render the entire list (simple way to update UI)
            updatePersistedShoppingList([...ingredients]); // Persist the change (pass a copy)
            if (ingredients.length === 0) {
                 showSuccessMessage("Shopping list emptied!");
            }
        };

        item.appendChild(leftSide);
        item.appendChild(deleteBtn);
        listGroup.appendChild(item);
    });

    outputContainer.appendChild(listGroup);

    // Enable or disable the "Clear Shopping List" button based on whether the list has items
    if (clearBtn) {
        clearBtn.disabled = ingredients.length === 0;
    }
}



async function loadShoppingList() { // Made async
    const outputContainer = document.getElementById('shoppingListResults');
    const clearBtn = document.getElementById('clearShoppingListBtn');
    if (!outputContainer || !clearBtn) return;

    outputContainer.innerHTML = '<div class="list-group-item text-muted">Loading shopping list...</div>';
    clearBtn.disabled = true;

    if (currentUser) {
        // --- LOGGED IN: Load from Firebase ---
        try {
            const docRef = db.collection("shopping").doc(currentUser.uid);
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                if (data.ingredients && data.ingredients.length > 0) {
                    renderShoppingList(data.ingredients);
                    clearBtn.disabled = false;
                } else {
                    outputContainer.innerHTML = '<div class="list-group-item text-muted text-center">Generate a list from your planned meals.</div>';
                }
            } else {
                outputContainer.innerHTML = '<div class="list-group-item text-muted text-center">No shopping list found. Generate one!</div>';
                // Optional: Initialize an empty list document if it's critical for other logic
                // await docRef.set({ ingredients: [], uid: currentUser.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
        } catch (err) {
            console.error("❌ Failed to load shopping list from Firestore:", err);
            outputContainer.innerHTML = '<p class="text-danger text-center">Error loading shopping list.</p>';
        }
    } else {
        // --- NOT LOGGED IN: Load from LocalDB ---
        if (!localDB) {
            outputContainer.innerHTML = '<p class="text-warning text-center">Local storage not available.</p>';
            return;
        }
        try {
            // Assuming we use a fixed ID for the anonymous user's shopping list
            const localShoppingList = await localDB.shoppingList.get("localUserShoppingList");
            if (localShoppingList && localShoppingList.ingredients && localShoppingList.ingredients.length > 0) {
                renderShoppingList(localShoppingList.ingredients);
                clearBtn.disabled = false;
            } else {
                outputContainer.innerHTML = '<div class="list-group-item text-muted text-center">No local shopping list. Generate one from locally planned meals!</div>';
            }
        } catch (err) {
            console.error("❌ Failed to load shopping list from LocalDB:", err.stack || err);
            outputContainer.innerHTML = '<p class="text-danger text-center">Error loading local shopping list.</p>';
        }
    }
}

function confirmClearShoppingList() {
    const clearBtn = document.getElementById('clearShoppingListBtn');
    if (!clearBtn || clearBtn.disabled) return;

    const existingConfirm = clearBtn.parentElement.querySelector('.confirm-clear-shopping-controls');
    if (existingConfirm) {
        existingConfirm.remove();
        clearBtn.style.display = 'inline-block';
        return;
    }

    clearBtn.style.display = 'none';

    const confirmControls = document.createElement('span');
    confirmControls.className = 'confirm-clear-shopping-controls ms-2';
    // ... (setup confirmText, yesBtn, noBtn as in confirmClearAllPlanning) ...
    const confirmText = document.createElement('span'); /* ... */
    const yesBtn = document.createElement('button');    /* ... */
    const noBtn = document.createElement('button');     /* ... */
    confirmText.textContent = "Clear entire shopping list?";
    yesBtn.className = 'btn btn-sm btn-danger me-1'; yesBtn.innerHTML = 'Yes, Clear';
    noBtn.className = 'btn btn-sm btn-secondary'; noBtn.innerHTML = 'No';


    const cleanupAndRestore = () => {
        confirmControls.remove();
        clearBtn.style.display = 'inline-block';
    };

    yesBtn.onclick = async () => { // Made async
        const outputContainer = document.getElementById('shoppingListResults');
        if (currentUser) {
            // --- LOGGED IN: Clear Firebase shopping list for this user ---
            try {
                await db.collection("shopping").doc(currentUser.uid).set({ ingredients: [], uid: currentUser.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                if(outputContainer) outputContainer.innerHTML = '<div class="list-group-item text-muted text-center">Shopping list cleared.</div>';
                clearBtn.disabled = true;
                console.log("✅ Firestore shopping list cleared.");
                showSuccessMessage("Shopping list cleared from your account.");
            } catch (err) {
                console.error("❌ Failed to clear Firestore shopping list:", err);
                alert("Error clearing shopping list: " + err.message);
            } finally {
                cleanupAndRestore();
            }
        } else {
            // --- NOT LOGGED IN: Clear LocalDB shopping list ---
            if (!localDB) {
                alert("Local storage not available.");
                cleanupAndRestore();
                return;
            }
            try {
                // Remove the specific item or clear the ingredients array within it
                await localDB.shoppingList.put({ id: "localUserShoppingList", name: "My Local Shopping List", ingredients: [], updatedAt: new Date().toISOString() });
                // Or if you want to delete the whole record: await localDB.shoppingList.delete("localUserShoppingList");
                if(outputContainer) outputContainer.innerHTML = '<div class="list-group-item text-muted text-center">Local shopping list cleared.</div>';
                clearBtn.disabled = true;
                console.log("✅ LocalDB shopping list cleared.");
                showSuccessMessage("Local shopping list cleared.");
            } catch (err) {
                console.error("❌ Failed to clear LocalDB shopping list:", err.stack || err);
                alert("Error clearing local shopping list: " + err.message);
            } finally {
                cleanupAndRestore();
            }
        }
    };
    noBtn.onclick = cleanupAndRestore;
    // ... (append confirmText, yesBtn, noBtn to confirmControls) ...
    // ... (append confirmControls to clearBtn.parentElement) ...
    confirmControls.appendChild(confirmText);
    confirmControls.appendChild(yesBtn);
    confirmControls.appendChild(noBtn);
    clearBtn.parentElement.appendChild(confirmControls);
}


function clearCheckedIngredients() {
  const clearBtn = document.getElementById('clearCheckedBtn');
  if (!clearBtn) return;

  // Prevent multiple confirms
  if (clearBtn.parentElement.querySelector('.confirm-clear-checked')) return;

  clearBtn.style.display = 'none'; // Hide original button

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-clear-checked d-flex gap-2 align-items-center';

  const confirmText = document.createElement('span');
  confirmText.textContent = 'Clear all checked items?';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-danger';
  yesBtn.textContent = 'Yes';

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-dark';
  noBtn.textContent = 'No';

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);

  clearBtn.parentElement.appendChild(confirmArea);

  // Yes clears
  yesBtn.onclick = () => {
    db.collection("shopping").doc(currentUser.uid).get().then(doc => {
      if (!doc.exists) return;

      const data = doc.data();
      const filtered = data.ingredients.filter(ing => !ing.checked);

      return db.collection("shopping").doc(currentUser.uid).set({ ingredients, uid: currentUser.uid })
        .then(() => {
          renderShoppingList(filtered);
          console.log("✅ Cleared checked items");

          // Cleanup UI
          confirmArea.remove();
          clearBtn.style.display = 'none'; // still hidden if no checked left
        });
    }).catch(err => {
      console.error("❌ Failed to clear checked items:", err);
    });
  };

  // No cancels
  noBtn.onclick = () => {
    confirmArea.remove();
    clearBtn.style.display = 'block'; // restore button
  };
}


function updateClearCheckedButton(ingredients) {
  const hasChecked = ingredients.some(ing => ing.checked);
  const btn = document.getElementById('clearCheckedBtn');
  if (btn) {
    btn.style.display = hasChecked ? 'block' : 'none';
  }
}

// Utility to get initials
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  const first = parts[0]?.charAt(0).toUpperCase() || '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
  return first + last;
}

/**
 * Sets the 'active' class on the correct navigation button for both mobile and desktop
 * and removes it from others.
 * @param {string} viewName - The name of the view to activate (e.g., 'recipes', 'history', 'pantry', 'plan', 'account').
 */
function setActiveNavButton(viewName) {
    if (!viewName) {
        console.warn("setActiveNavButton called with no viewName.");
        return;
    }
    currentActiveView = viewName.toLowerCase(); // Standardize to lowercase

    // --- Handle Mobile Bottom Navigation Bar ---
    const bottomNavButtons = document.querySelectorAll('#bottomNavBar .btn-nav');
    if (bottomNavButtons.length > 0) {
        bottomNavButtons.forEach(btn => {
            btn.classList.remove('active'); // Remove 'active' from all
            if (btn.dataset.view === currentActiveView) {
                btn.classList.add('active'); // Add 'active' to the matching button
            }
        });
    } else {
        // This might log if on desktop where bottomNavBar is display:none, which is fine.
        // console.warn("#bottomNavBar .btn-nav elements not found.");
    }

    // --- Handle Desktop Top Menu Bar ---
    // Assumes buttons in #menuBar have data-view attributes matching viewName
    // and that active state means changing from btn-outline-* to btn-* (solid)
    const desktopNavButtons = document.querySelectorAll('#menuBar button.btn');
    if (desktopNavButtons.length > 0) {
        desktopNavButtons.forEach(btn => {
            // Reset all desktop buttons to their default outline style
            // This requires knowing their original outline style or having a common one
            // For simplicity, we'll remove 'active' and a generic 'btn-primary' (if used for active)
            // and ensure their specific outline class is present.
            btn.classList.remove('active', 'btn-primary', 'btn-info', 'btn-success', 'btn-secondary', 'btn-warning'); // Remove common solid styles and active

            // Re-apply original outline style based on its data-view or a default
            const originalOutlineStyle = {
                'recipes': 'btn-outline-primary',
                'history': 'btn-outline-info',
                'plan': 'btn-outline-success',
                'pantry': 'btn-outline-secondary',
                // 'chefbot' doesn't have a data-view for active state typically
            };
            
            if (btn.dataset.view && originalOutlineStyle[btn.dataset.view]) {
                if (!btn.classList.contains(originalOutlineStyle[btn.dataset.view])) {
                    // Remove other outlines before adding the correct one
                    Object.values(originalOutlineStyle).forEach(cls => btn.classList.remove(cls));
                    btn.classList.add(originalOutlineStyle[btn.dataset.view]);
                }
            } else if (!btn.getAttribute('onclick')?.includes('showChatbotModal')) { 
                // Default for any other buttons that aren't the Chef Bot button
                // and don't have a specific mapping (unlikely if data-view is used consistently)
                if (!btn.classList.contains('btn-outline-dark')) { // Assuming a default outline
                     Object.values(originalOutlineStyle).forEach(cls => btn.classList.remove(cls)); // remove specific outlines
                     btn.classList.add('btn-outline-dark'); // a generic fallback
                }
            }


            // Set the active desktop button
            if (btn.dataset.view === currentActiveView) {
                btn.classList.add('active');
                // Change from outline to solid for active state
                if (originalOutlineStyle[btn.dataset.view]) {
                    btn.classList.remove(originalOutlineStyle[btn.dataset.view]); // Remove e.g., btn-outline-primary
                    btn.classList.add(originalOutlineStyle[btn.dataset.view].replace('outline-', '')); // Add e.g., btn-primary
                } else {
                    btn.classList.remove('btn-outline-dark');
                    btn.classList.add('btn-dark'); // Fallback solid style
                }
            }
        });
    } else {
        // console.warn("#menuBar button.btn elements not found.");
    }

    console.log(`Active navigation set to: ${currentActiveView}`);
}

function handleAccountNavClick() {
    setActiveNavButton("account");
    console.log("handleAccountNavClick called. currentUser:", currentUser); // First debug log
    
    // Set the active state for the 'account' tab
    // Make sure setActiveNavButton is defined and works correctly.
    if (typeof setActiveNavButton === "function") {
        setActiveNavButton("account");
    } else {
        console.warn("setActiveNavButton function is not defined.");
    }

    if (currentUser) {
        // User is logged in - show account options (e.g., a modal with logout)
        console.log("User is logged in. Showing account options.");
        const userEmail = currentUser.email || "your account";
        showInfoConfirmModal( // Ensure this function and its modal instance are working
            "Account Options",
            `<p>You are signed in as ${escapeHtml(userEmail)}.</p><p class="mt-3">Manage your account or view preferences here (eventually).</p>`,
            [
                { 
                    text: '<i class="bi bi-gear-fill me-2"></i>Settings', 
                    class: 'btn-primary btn-sm', 
                    onClick: () => { 
                        openUserSettingsModal(); // A new function we will create
                    },
                    dismissOnClick: true
                },
                { 
                    text: 'Log Out', 
                    class: 'btn-danger btn-sm', 
                    onClick: () => { 
                        if(infoConfirmModalInstance) infoConfirmModalInstance.hide(); 
                        signOut(); 
                    },
                    dismissOnClick: false 
                },
                { text: 'Close', class: 'btn-secondary btn-sm', dismiss: true }
            ]
        );
    } else {
        // User is not logged in - show the login modal
        console.log("User is not logged in. Calling showLoginModal().");
        if (typeof showLoginModal === "function") {
            showLoginModal();
        } else {
            console.error("showLoginModal function is not defined!");
            alert("Login functionality is currently unavailable.");
        }
    }
}

// Update auth UI
function updateAuthUI(user) {
    const authAreaDesktop = document.getElementById('userAuthAreaDesktop');
    const authNavButtonMobile = document.getElementById('userAuthNavButton'); // For the mobile bottom nav "Account" button

    // --- 1. Update Desktop Authentication Area ---
    if (authAreaDesktop) {
        authAreaDesktop.innerHTML = ''; // Clear previous content
        if (user) {
            // User is signed in - Create the desktop dropdown
            const wrapper = document.createElement('div');
            wrapper.className = 'position-relative';

            const avatarBtn = document.createElement('button');
            avatarBtn.className = 'btn btn-outline-dark rounded-circle fw-bold d-flex align-items-center justify-content-center';
            avatarBtn.style.width = '40px'; // Slightly smaller for a top bar
            avatarBtn.style.height = '40px';
            avatarBtn.style.fontSize = '0.9rem';
            avatarBtn.style.padding = '0';
            avatarBtn.title = user.displayName || user.email || 'Account';
            avatarBtn.textContent = getInitials(user.displayName || user.email); // Ensure getInitials is defined
            avatarBtn.setAttribute('aria-expanded', 'false');
            avatarBtn.setAttribute('data-bs-toggle', 'dropdown'); // For Bootstrap dropdown behavior (optional)

            const dropdownMenu = document.createElement('div');
            dropdownMenu.className = 'user-info-dropdown shadow rounded dropdown-menu dropdown-menu-end'; // Added Bootstrap classes
            // Removed inline styles for display, position, z-index, width, bg-color, padding, border as Bootstrap + CSS should handle it.
            // CSS will target .user-info-dropdown

            let providerIconHtml = '<i class="bi bi-person-circle me-2 fs-5 text-secondary"></i>'; // Default icon
            if (user.providerData && user.providerData.length > 0) {
                const mainProviderId = user.providerData[0].providerId;
                if (mainProviderId === 'google.com') {
                    providerIconHtml = '<i class="bi bi-google me-2 fs-5" style="color: #DB4437;"></i>';
                } else if (mainProviderId === 'password') {
                    providerIconHtml = '<i class="bi bi-envelope-fill me-2 fs-5" style="color: #0d6efd;"></i>';
                } // Add more providers as needed (Apple, Microsoft)
            }

            dropdownMenu.innerHTML = `
                <div class="px-3 pt-2 pb-1 text-muted small">Signed in as:</div>
                <div class="px-3 pb-2 pt-1 d-flex align-items-center">
                    ${providerIconHtml}
                    <span class="text-truncate fw-medium" style="font-size: 0.9rem;">${escapeHtml(user.email || "User")}</span>
                </div>
                <div><hr class="dropdown-divider my-1"></div>
                <a class="dropdown-item d-flex align-items-center user-info-logout-link" href="#" style="color: #dc3545;">
                    <i class="bi bi-box-arrow-right me-2 fs-5"></i> Log out
                </a>
            `;
            
            const signOutLink = dropdownMenu.querySelector('.user-info-logout-link');
            if (signOutLink) {
                signOutLink.onclick = (e) => {
                    e.preventDefault();
                    signOut();
                    // Bootstrap dropdown should close automatically, but can force if needed
                    // const ddInstance = bootstrap.Dropdown.getInstance(avatarBtn);
                    // if (ddInstance) ddInstance.hide();
                };
            }

            // Bootstrap 5 dropdown initialization (if not using data-bs-toggle on button)
            // For simplicity, if using data-bs-toggle="dropdown" on avatarBtn, this might not be needed explicitly
            // but good to be aware of if issues arise with dropdown not showing.
            // Ensure avatarBtn has `data-bs-toggle="dropdown"` and dropdownMenu has `aria-labelledby` pointing to avatarBtn's ID.
            // If avatarBtn itself is the toggle, it needs an ID, e.g., id="userAvatarDropdownToggle"
            // and dropdownMenu would have aria-labelledby="userAvatarDropdownToggle"

            avatarBtn.id = `userAvatarToggle-${Date.now()}`; // Ensure unique ID for aria
            dropdownMenu.setAttribute('aria-labelledby', avatarBtn.id);


            wrapper.appendChild(avatarBtn);
            wrapper.appendChild(dropdownMenu);
            authAreaDesktop.appendChild(wrapper);

            // Initialize Bootstrap dropdown for the newly created elements
             new bootstrap.Dropdown(avatarBtn); // Initialize the dropdown behavior

            // The global click listener to close the dropdown when clicking outside
            // should be managed carefully to avoid adding multiple listeners.
            // It's often better to have one persistent global listener.
            // For now, let's assume the Bootstrap Dropdown handles outside clicks.

        } else { // User is not logged in - Desktop
            const signInBtnDesktop = document.createElement('button');
            signInBtnDesktop.className = 'btn btn-outline-dark btn-sm';
            signInBtnDesktop.innerHTML = `<i class="bi bi-person-circle me-1"></i> Sign in`;
            signInBtnDesktop.onclick = showLoginModal;
            authAreaDesktop.appendChild(signInBtnDesktop);
        }
    } else {
        console.warn("updateAuthUI: #userAuthAreaDesktop element not found in DOM.");
    }

    // --- 2. Update Mobile Bottom Navigation "Account" Button ---
    if (authNavButtonMobile) {
        if (user) {
            authNavButtonMobile.innerHTML = `
                <i class="bi bi-person-check-fill fs-4"></i>
                <span class="nav-label d-block small">Account</span>`;
        } else {
            authNavButtonMobile.innerHTML = `
                <i class="bi bi-person-circle fs-4"></i>
                <span class="nav-label d-block small">Log In</span>`;
        }
        // The onclick is already set in the HTML: onclick="handleAccountNavClick()"
        // So, we don't need to re-assign it here unless the HTML attribute is removed.
        // If you were assigning it here, it would look like:
        // authNavButtonMobile.onclick = handleAccountNavClick; 
    } else {
        console.warn("updateAuthUI: #userAuthNavButton element not found for mobile.");
    }
}

function handleEmailContinue() {
    const email = document.getElementById('loginEmailInput').value.trim();
    clearLoginErrorMessages(); // Clear any previous errors in initial view

    if (!email) {
        // You might want a dedicated error display spot in the initialLoginOptionsView
        alert('Please enter your email address.'); // Simple alert for now
        document.getElementById('loginEmailInput').focus();
        return;
    }

    // Check if user exists with this email
    firebase.auth().fetchSignInMethodsForEmail(email)
      .then((signInMethods) => {
        if (signInMethods.length === 0) {
          // Email does not exist, so it's a new user -> go to Sign Up view
          console.log("Email not found, switching to Sign Up view.");
          switchToSignUpView(); // Email will be prefilled by switchToSignUpView
        } else {
          // Email exists
          if (signInMethods.includes('password')) {
            // User has an email/password account
            console.log("Email found with password provider, switching to Password Login view.");
            switchToPasswordLoginView(email);
          } else {
            // User exists but signed up with a social provider (e.g., Google)
            // And does NOT have a password set for this email with Firebase.
            console.log("Email found with social provider(s):", signInMethods.join(', '));
            // Option 1: Guide to social login
            // displayLoginError('initial', `This email is registered with ${signInMethods.join(', ')}. Please use that method to sign in, or sign up to create a new password for this email.`);
            
            // Option 2: Allow them to create a password for this existing social account (more complex, involves linking or effectively "taking over" if they prove email ownership via reset)
            // For now, let's guide them to sign up if they want to use email/password, or they can use their social login.
            // Or directly take them to the password login screen, and if they don't know the password, they can use "Forgot Password"
            // which (as we saw) effectively adds/sets a password for the email provider on that account.
            switchToPasswordLoginView(email);
            // Optionally, add a message in the passwordLoginView:
            const loginErrorDiv = document.getElementById('loginErrorMessage');
            if (loginErrorDiv) {
                loginErrorDiv.textContent = `This email is associated with another sign-in method (e.g., Google). Enter password if you've set one, or use "Forgot Password" to set/reset.`;
                loginErrorDiv.style.display = 'block';
                loginErrorDiv.classList.remove('alert-danger'); // Make it informational
                loginErrorDiv.classList.add('alert-info');
            }
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching sign-in methods for email:", error);
        // Display a generic error for fetchSignInMethodsForEmail
        alert(`Error checking email: ${error.message}`);
      });
}

function performEmailPasswordLogin() {
    const email = document.getElementById('emailForPasswordLogin').value;
    const password = document.getElementById('passwordForLogin').value;
    clearLoginErrorMessages();

    if (!email || !password) {
        displayLoginError('login', "Please enter both email and password.");
        return;
    }

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            console.log("Logged in successfully with email/password:", userCredential.user);
            hideLoginModal(); // Firebase onAuthStateChanged will handle UI update
        })
        .catch((error) => {
            console.error("Email/Password Login Error:", error.code, error.message);
            displayLoginError('login', error.message);
            // Clear password field on error for security/UX
            document.getElementById('passwordForLogin').value = '';
            document.getElementById('passwordForLogin').focus();
        });
}


function performEmailPasswordSignUp() {
    const email = document.getElementById('emailForSignUp').value;
    const password = document.getElementById('passwordForSignUp').value;
    const confirmPassword = document.getElementById('confirmPasswordForSignUp').value;
    clearLoginErrorMessages();

    if (!email || !password || !confirmPassword) {
        displayLoginError('signup', "Please fill in all fields.");
        return;
    }
    if (password.length < 6) { // Firebase default minimum
        displayLoginError('signup', "Password should be at least 6 characters.");
        return;
    }
    if (password !== confirmPassword) {
        displayLoginError('signup', "Passwords do not match.");
        return;
    }

    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            console.log("Signed up successfully with email/password:", userCredential.user);
            hideLoginModal(); // Firebase onAuthStateChanged will handle UI update
        })
        .catch((error) => {
            console.error("Email/Password SignUp Error:", error.code, error.message);
            if (error.code === 'auth/email-already-in-use') {
                 displayLoginError('signup', 'This email is already in use. Please try logging in instead.');
            } else {
                 displayLoginError('signup', error.message);
            }
        });
}

function handleForgotPassword(emailToReset) {
    const email = emailToReset || document.getElementById('emailForPasswordLogin').value || document.getElementById('loginEmailInput').value;
    
    if (!email) {
        displayLoginError('login', "Please enter your email address in the email field to reset password.");
        return;
    }
    clearLoginErrorMessages();

    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            alert("Password reset email sent to " + email + "! Check your inbox (and spam folder).");
            // Hide the password form, show a success message, or take them back to initial options
            switchToInitialOptionsView();
            // Or provide a message within the passwordLoginView
            // displayLoginError('login', "Password reset email sent! Check your inbox."); 
            // document.getElementById('loginErrorMessage').classList.replace('alert-danger', 'alert-success');
        })
        .catch((error) => {
            console.error("Forgot Password Error:", error.code, error.message);
            displayLoginError('login', error.message);
        });
}

// Google Sign In
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            console.log("✅ Signed in with Google:", result.user.displayName);
            // updateAuthUI is typically called by onAuthStateChanged
            hideLoginModal(); // Add this
        })
        .catch((error) => {
            console.error("❌ Google Sign-in error:", error);
            // Display error in the modal if it's open
            if (document.getElementById('loginModal').classList.contains('show')) {
                displayLoginError('initial', error.message); // Or a general error area in the modal
            }
        });
}

// Sign Out
function signOut() {
  auth.signOut()
    .then(() => {
      console.log("✅ Signed out");
      updateAuthUI(null);
    })
    .catch((error) => {
      console.error("❌ Sign-out error:", error);
    });
}

// Watch auth state and test
// script.js

// ... (your existing Firebase initialization, currentUser, localDB, etc.)

auth.onAuthStateChanged(async (user) => {
    const previousUser = currentUser;
    currentUser = user;
    
    updateAuthUI(user);

    if (user) {
        console.log("User authenticated:", user.uid);
        
        try {
            const userRef = db.collection('users').doc(user.uid);
            const userDoc = await userRef.get();
            // Get preferences object, or an empty object if it doesn't exist
            const preferences = userDoc.exists ? userDoc.data().preferences : {};

            // Load Sort Order preference
            currentSortOrder = preferences.recipeSortOrder || 'all';
            console.log(`Loaded sort preference '${currentSortOrder}'.`);

            // Load Folder preference
            // We check for undefined so that 'null' (for All Recipes) is a valid saved preference
            currentFolderId = preferences.lastSelectedFolderId !== undefined ? preferences.lastSelectedFolderId : null;
            console.log(`Loaded folder preference '${currentFolderId}'.`);

        } catch (error) {
            console.error("Error fetching user preferences, using defaults:", error);
            currentSortOrder = 'all';
            currentFolderId = null; 
        }
        
        // Load data first, then render the UI in the correct order
        await loadFolders();
        await loadInitialRecipes();
        renderFolders(); 
        
        // Check for local data to migrate after everything else is loaded
        if (!previousUser) {
            checkAndPromptForLocalDataMigration(user);
        }

    } else { // User is not logged in
        console.log("User is not authenticated. Operating in 'Local Mode'.");
        
        // Reset state to defaults on logout
        currentSortOrder = 'all';
        currentFolderId = null; 
        folders = [];

        await loadInitialRecipes();
        renderFolders(); // Render the empty/default folder list
    }
});

async function checkAndPromptForLocalDataMigration(loggedInUser) {
    if (!localDB) {
        console.warn("LocalDB not available, skipping migration check.");
        return;
    }

    try {
        const localRecipeCount = await localDB.recipes.count();
        const localHistoryCount = await localDB.history.count();
        const localPlanningCount = await localDB.planning.count();
        const totalLocalItems = localRecipeCount + localHistoryCount + localPlanningCount;

        if (totalLocalItems > 0) {
            console.log(`Found ${localRecipeCount} local recipes, ${localHistoryCount} history items, ${localPlanningCount} planned meals to potentially migrate.`);
            
            const welcomeName = loggedInUser.displayName || loggedInUser.email;
            const title = `Welcome, ${welcomeName}!`;
            const body = `
                <p>You have <strong>${totalLocalItems} item(s)</strong> (recipes, history, plans) saved locally on this device from a previous session.</p>
                <p>Would you like to save them to your account? This will allow you to access them on other devices.</p>
            `;
            const buttons = [
                {
                    text: 'Yes, Save to My Account',
                    class: 'btn-success',
                    onClick: async () => {
                        infoConfirmModalInstance.hide(); // Hide prompt modal first
                        console.log("User agreed to migrate local data.");
                        await migrateLocalDataToFirestore(currentUser);
                    },
                    dismissOnClick: false // Don't auto-close; migrateLocalDataToFirestore will handle further UI
                },
                {
                    text: 'Not Now',
                    class: 'btn-secondary',
                    onClick: () => {
                        console.log("User declined to migrate local data at this time.");
                        // Use the modal again for this secondary message or a toast
                        infoConfirmModalInstance.hide(); // Hide the current modal first
                        setTimeout(() => { // Slight delay to ensure first modal is gone
                            showInfoConfirmModal(
                                "Local Data Notice",
                                "<p>Your local data will remain on this device only for now. You can manage or migrate it later from app settings (if this feature is added).</p>",
                                [{ text: 'OK', class: 'btn-primary', dismiss: true }]
                            );
                        }, 300);
                    },
                    dismissOnClick: false
                }
            ];
            showInfoConfirmModal(title, body, buttons);

        } else {
            console.log("No significant local data found to migrate.");
        }
    } catch (error) {
        console.error("Error checking for local data to migrate:", error.stack || err);
        showInfoConfirmModal("Migration Check Error", `<p class="text-danger">An error occurred while checking for local data to migrate: ${error.message}</p>`);
    }
}

async function migrateLocalDataToFirestore(user) {
    if (!user || !user.uid || !localDB) {
        console.error("Migration cannot proceed: User not logged in or localDB not available.");
        // Use the modal for user-facing errors
        showInfoConfirmModal(
            "Migration Error",
            "<p class='text-danger'>Could not start data migration. Please ensure you are properly logged in and local storage is accessible.</p>",
            [{ text: 'OK', class: 'btn-primary', dismiss: true }]
        );
        return;
    }

    // Show a persistent "Migrating..." message using the modal
    showInfoConfirmModal(
        "Migrating Data",
        "<p>Migrating your locally saved data to your account... Please wait.</p><div class='progress'><div class='progress-bar progress-bar-striped progress-bar-animated' role='progressbar' style='width: 100%' aria-valuenow='100' aria-valuemin='0' aria-valuemax='100'></div></div>",
        [] // No buttons initially, it will be updated by the summary
    );

    const migrationStatus = {
        recipes: { migrated: 0, skipped: 0, failed: 0, existing: 0 },
        history: { migrated: 0, skipped: 0, failed: 0 },
        planning: { migrated: 0, skipped: 0, failed: 0, recipeNotFound: 0 },
        shoppingList: { migrated: 0, failed: 0, itemsMigrated: 0 } // Track if the list itself was migrated and how many items
    };

    const localToCloudRecipeIdMap = new Map();

    // --- 1. Migrate Recipes and build ID Map ---
    try {
        const localRecipes = await localDB.recipes.toArray();
        if (localRecipes.length > 0) {
            console.log(`Starting migration of ${localRecipes.length} local recipes.`);
            let existingCloudRecipes = new Map();
            const cloudSnapshot = await db.collection('recipes').where('uid', '==', user.uid).get();
            cloudSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.name) {
                    existingCloudRecipes.set(data.name.toLowerCase().trim(), doc.id);
                }
            });

            for (const localRecipe of localRecipes) {
                const localRecipeNameLower = (localRecipe.name || "").toLowerCase().trim();
                if (existingCloudRecipes.has(localRecipeNameLower)) {
                    const existingFirestoreId = existingCloudRecipes.get(localRecipeNameLower);
                    localToCloudRecipeIdMap.set(localRecipe.localId, existingFirestoreId);
                    migrationStatus.recipes.existing++;
                    continue;
                }

                const recipeForFirestore = {
                    name: localRecipe.name,
                    ingredients: localRecipe.ingredients || [],
                    instructions: localRecipe.instructions || "",
                    tags: localRecipe.tags || [],
                    rating: localRecipe.rating || 0,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    uid: user.uid
                };
                try {
                    const docRef = await db.collection('recipes').add(recipeForFirestore);
                    localToCloudRecipeIdMap.set(localRecipe.localId, docRef.id);
                    migrationStatus.recipes.migrated++;
                } catch (err) {
                    console.error(`Failed to migrate recipe "${localRecipe.name}":`, err);
                    migrationStatus.recipes.failed++;
                }
            }
        }
    } catch (err) {
        console.error("Error during local recipes migration phase:", err);
        const uncounted = await localDB.recipes.count(); // approx
        migrationStatus.recipes.failed = uncounted - (migrationStatus.recipes.migrated + migrationStatus.recipes.existing + migrationStatus.recipes.skipped);

    }

    // --- 2. Migrate History ---
    try {
        const localHistoryItems = await localDB.history.toArray();
        if (localHistoryItems.length > 0) {
            console.log(`Starting migration of ${localHistoryItems.length} local history items.`);
            for (const localItem of localHistoryItems) {
                const historyForFirestore = {
                    recipeName: localItem.recipeName,
                    notes: localItem.notes || "",
                    tags: localItem.tags || [],
                    timestamp: localItem.timestamp,
                    uid: user.uid
                };
                try {
                    await db.collection('history').add(historyForFirestore);
                    migrationStatus.history.migrated++;
                } catch (err) {
                    console.error(`Failed to migrate history for "${localItem.recipeName}":`, err);
                    migrationStatus.history.failed++;
                }
            }
        }
    } catch (err) {
        console.error("Error during local history migration phase:", err);
        migrationStatus.history.failed = (await localDB.history.count()) - migrationStatus.history.migrated;
    }

    // --- 3. Migrate Planning (using the localToCloudRecipeIdMap) ---
    try {
        const localPlanningItems = await localDB.planning.toArray();
        if (localPlanningItems.length > 0) {
            console.log(`Starting migration of ${localPlanningItems.length} local planning items.`);
            for (const localItem of localPlanningItems) {
                const firestoreRecipeId = localToCloudRecipeIdMap.get(localItem.recipeLocalId);
                if (!firestoreRecipeId) {
                    migrationStatus.planning.recipeNotFound++;
                }
                const planningForFirestore = {
                    date: localItem.date,
                    recipeName: localItem.recipeName,
                    recipeId: firestoreRecipeId || null,
                    uid: user.uid
                };
                try {
                    await db.collection('planning').add(planningForFirestore);
                    migrationStatus.planning.migrated++;
                } catch (err) {
                    console.error(`Failed to migrate plan for "${localItem.recipeName}" on ${localItem.date}:`, err);
                    migrationStatus.planning.failed++;
                }
            }
        }
    } catch (err) {
        console.error("Error during local planning migration phase:", err);
         migrationStatus.planning.failed = (await localDB.planning.count()) - (migrationStatus.planning.migrated + migrationStatus.planning.recipeNotFound);
    }

    // --- 4. Migrate Shopping List ---
    try {
        const localShoppingListData = await localDB.shoppingList.get("localUserShoppingList");
        if (localShoppingListData && localShoppingListData.ingredients && localShoppingListData.ingredients.length > 0) {
            console.log(`Starting migration of local shopping list with ${localShoppingListData.ingredients.length} items.`);
            const shoppingListForFirestore = {
                ingredients: localShoppingListData.ingredients,
                uid: user.uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                // This will overwrite any existing cloud shopping list for the user
                await db.collection("shopping").doc(user.uid).set(shoppingListForFirestore);
                migrationStatus.shoppingList.migrated = 1; // Indicate the list itself was migrated
                migrationStatus.shoppingList.itemsMigrated = localShoppingListData.ingredients.length;
                console.log("Migrated local shopping list to Firestore.");
            } catch (err) {
                console.error("Failed to migrate shopping list:", err);
                migrationStatus.shoppingList.failed = 1;
            }
        } else {
            console.log("No active local shopping list found to migrate.");
        }
    } catch (err) {
        console.error("Error during local shopping list migration phase:", err);
    }

    // --- Migration Summary & Cleanup ---
    let summaryTitle = "Migration Complete";
    let summaryBody = "<p>Your local data migration to your account is complete:</p><ul>";
    let hadItemsToReport = false;
    let hadFailures = false;

    if (migrationStatus.recipes.migrated > 0 || migrationStatus.recipes.existing > 0 || migrationStatus.recipes.failed > 0 || migrationStatus.recipes.skipped > 0) {
        summaryBody += `<li>Recipes: ${migrationStatus.recipes.migrated} saved, ${migrationStatus.recipes.existing} found in cloud, ${migrationStatus.recipes.skipped} skipped, ${migrationStatus.recipes.failed} failed.</li>`;
        hadItemsToReport = true;
        if (migrationStatus.recipes.failed > 0) hadFailures = true;
    }
    if (migrationStatus.history.migrated > 0 || migrationStatus.history.failed > 0 || migrationStatus.history.skipped > 0) {
        summaryBody += `<li>History: ${migrationStatus.history.migrated} saved, ${migrationStatus.history.skipped} skipped, ${migrationStatus.history.failed} failed.</li>`;
        hadItemsToReport = true;
        if (migrationStatus.history.failed > 0) hadFailures = true;
    }
    if (migrationStatus.planning.migrated > 0 || migrationStatus.planning.recipeNotFound > 0 || migrationStatus.planning.failed > 0 || migrationStatus.planning.skipped > 0) {
        summaryBody += `<li>Planned Meals: ${migrationStatus.planning.migrated} saved, ${migrationStatus.planning.recipeNotFound} recipe links missing, ${migrationStatus.planning.skipped} skipped, ${migrationStatus.planning.failed} failed.</li>`;
        hadItemsToReport = true;
        if (migrationStatus.planning.failed > 0 || migrationStatus.planning.recipeNotFound > 0) hadFailures = true;
    }
    if (migrationStatus.shoppingList.migrated > 0 || migrationStatus.shoppingList.failed > 0) {
        summaryBody += `<li>Shopping List: ${migrationStatus.shoppingList.itemsMigrated} items saved to your account ${migrationStatus.shoppingList.failed > 0 ? '(failed to save list)' : ''}.</li>`;
        hadItemsToReport = true;
        if (migrationStatus.shoppingList.failed > 0) hadFailures = true;
    }
    summaryBody += "</ul>";

    if (!hadItemsToReport) {
        summaryBody = "<p>No new local data was found to migrate to your account.</p>";
    }
    if (hadFailures) {
        summaryBody += `<p class="text-danger mt-2">Some items could not be saved to your account. They will remain on this device for now.</p>`;
    }

    // Show summary modal, replacing the "Migrating..." content
    const summaryButtons = [{
        text: 'OK',
        class: 'btn-primary',
        onClick: () => {
            infoConfirmModalInstance.hide();
            const totalMigratedOrExisting = migrationStatus.recipes.migrated + migrationStatus.recipes.existing +
                                       migrationStatus.history.migrated +
                                       migrationStatus.planning.migrated +
                                       migrationStatus.shoppingList.migrated; // Count list as 1 if items > 0

            if (totalMigratedOrExisting > 0 && !hadFailures) { // Only offer to clear if migration was largely successful for processed items
                setTimeout(() => {
                    const cleanupTitle = "Clear Local Data?";
                    const cleanupBody = "<p>Relevant local data has been saved to your account.</p><p>Would you like to remove these local copies from this device now?</p>";
                    const cleanupButtons = [
                        {
                            text: 'Yes, Clear Local Data', class: 'btn-danger',
                            onClick: async () => {
                                infoConfirmModalInstance.hide();
                                try {
                                    if (migrationStatus.recipes.migrated > 0 || migrationStatus.recipes.existing > 0) await localDB.recipes.clear();
                                    if (migrationStatus.history.migrated > 0) await localDB.history.clear();
                                    if (migrationStatus.planning.migrated > 0) await localDB.planning.clear();
                                    if (migrationStatus.shoppingList.migrated > 0) await localDB.shoppingList.delete("localUserShoppingList");
                                    console.log("Relevant local data stores cleared after migration.");
                                    showSuccessMessage("Local data cleared from this device.");
                                } catch (err) {
                                    console.error("Error clearing local data after migration:", err);
                                    showInfoConfirmModal("Cleanup Error", `<p class="text-danger">Could not fully clear local data. You can clear browser storage manually if needed.</p>`);
                                }
                                loadInitialRecipes(); // Reload from Firestore
                            },
                            dismissOnClick: false
                        },
                        {
                            text: 'No, Keep Local Data', class: 'btn-secondary',
                            onClick: () => {
                                infoConfirmModalInstance.hide();
                                showInfoConfirmModal("Local Data Kept", "<p>Your local data has been kept on this device. You can clear it from browser settings if desired.</p>");
                                loadInitialRecipes();
                            },
                            dismissOnClick: false
                        }
                    ];
                    showInfoConfirmModal(cleanupTitle, cleanupBody, cleanupButtons);
                }, 300);
            } else {
                loadInitialRecipes(); // Still reload from Firestore
            }
        },
        dismissOnClick: false // Important: Let the onClick logic handle hiding
    }];
    showInfoConfirmModal(summaryTitle, summaryBody, summaryButtons);
}

// Global click listener to close user dropdown
document.addEventListener('click', function (event) {
  const dropdown = document.querySelector('.user-dropdown');
  if (dropdown && dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
  }
});

function showSharedOverlay(recipe) {
    // Remove existing overlay if any
    const existingOverlay = document.querySelector('.shared-recipe-overlay-container');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = 'position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex justify-content-center align-items-start overflow-auto shared-recipe-overlay-container';
    overlay.style.zIndex = 2000;
    overlay.style.padding = '2rem';

    const card = document.createElement('div');
    card.className = 'card shadow-lg p-4 position-relative';
    card.style.maxWidth = '600px';
    card.style.width = '95%';
    card.style.margin = 'auto';

    // Using generateRecipeDisplayHTML for consistency
    card.innerHTML = `
        <button type="button" class="btn-close position-absolute top-0 end-0 m-3" aria-label="Close"></button>
        <div id="sharedRecipeContent">
            ${generateRecipeDisplayHTML(recipe)} 
        </div>
        <div class="d-flex justify-content-end gap-2 mt-3">
            <button id="saveSharedRecipeBtnInModal" class="btn btn-success">Save to My Recipes</button>
            <button id="closeSharedOverlayBtn" class="btn btn-outline-dark">Close</button>
        </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const closeOverlay = () => {
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
    };

    overlay.addEventListener('click', (e) => {
        if (!card.contains(e.target)) closeOverlay();
    });

    card.querySelector('.btn-close').onclick = closeOverlay;
    card.querySelector('#closeSharedOverlayBtn').onclick = closeOverlay;

    const saveBtn = card.querySelector('#saveSharedRecipeBtnInModal'); // Make sure ID is unique or use a class
    if (saveBtn) {
        saveBtn.textContent = 'Save to My Recipes'; // Or just "Save Recipe"

        saveBtn.onclick = () => {
            const closeOverlay = () => { // Helper to close the overlay
                if (overlay && overlay.parentNode) {
                    overlay.remove();
                }
            };

            if (currentUser) { // User IS LOGGED IN
                console.log("User logged in, saving shared recipe to Firestore.");
                saveSharedRecipeToFirestore(recipe); // Saves to Firestore
                closeOverlay();
            } else {
                // --- User is NOT LOGGED IN: Save to LocalDB ---
                console.log("User not logged in, saving shared recipe to LocalDB.");
                if (!localDB) {
                    alert("Local storage is not available at the moment. Please try again later or sign in.");
                    return;
                }
                const recipeToSaveLocally = {
                    name: recipe.name || "Unnamed Shared Recipe",
                    ingredients: recipe.ingredients || [],
                    instructions: recipe.instructions || "",
                    tags: recipe.tags || [],
                    sourceUrl: recipe.sourceUrl || null, // If shared recipes have a source URL
                    localId: generateLocalUUID(),
                    timestamp: new Date().toISOString(),
                };
                // Clean up any original shared recipe IDs or irrelevant fields
                delete recipeToSaveLocally.id; 
                delete recipeToSaveLocally.firestoreId;
                delete recipeToSaveLocally.uid;
                delete recipeToSaveLocally.hash;
                delete recipeToSaveLocally.createdAt;


                localDB.recipes.add(recipeToSaveLocally)
                    .then(() => {
                        showSuccessMessage("✅ Recipe saved locally!");
                        closeOverlay();
                        loadInitialRecipes(); // Refresh recipe list
                        showDelayedCloudSavePrompt("Recipe saved to this device! Sign up or log in to save it to the cloud and access anywhere!");
                    })
                    .catch(err => {
                        console.error("❌ Error saving shared recipe locally:", err.stack || err);
                        alert("Failed to save recipe locally: " + err.message);
                    });
            }
        };
    }
}

function saveSharedRecipeToFirestore(recipeDataFromSharedSource) {
    if (!currentUser) {
        console.error("Attempted to save shared recipe to Firestore without a current user.");
        alert("You must be signed in to save this recipe to your account.");
        return;
    }
    const newRecipe = {
        name: recipeDataFromSharedSource.name || "Unnamed Shared Recipe",
        ingredients: recipeDataFromSharedSource.ingredients || [],
        instructions: recipeDataFromSharedSource.instructions || "",
        tags: recipeDataFromSharedSource.tags || [],
        sourceUrl: recipeDataFromSharedSource.sourceUrl || null, // If shared recipes have a source URL
        uid: currentUser.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(), // Use server timestamp
        rating: 0 // Default rating
    };

    db.collection("recipes").add(newRecipe).then((docRef) => {
        showSuccessMessage(`✅ Recipe "${newRecipe.name}" saved to your account!`);
        console.log("Shared recipe added to user's Firestore with ID:", docRef.id);
        loadInitialRecipes(); // Refresh recipes
        if (window.history.replaceState) { // Clean URL query params from shared link
            history.replaceState({}, document.title, window.location.pathname);
        }
    }).catch(err => {
        console.error("❌ Error saving shared recipe to Firestore:", err);
        alert("Failed to save shared recipe to your account: " + err.message);
    });
}

function saveCurrentChatbotRecipeToFirestore() {
    if (!currentUser || !currentChatbotRecipe) {
        alert("Cannot save recipe. Ensure you are signed in and a recipe is generated.");
        return;
    }

    const recipeToSave = {
        name: currentChatbotRecipe.name || "AI Generated Recipe",
        ingredients: currentChatbotRecipe.ingredients || [],
        instructions: currentChatbotRecipe.instructions || "",
        tags: currentChatbotRecipe.tags || [],
        uid: currentUser.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        rating: currentChatbotRecipe.rating || 0,
    };
    delete recipeToSave.localId;

    db.collection("recipes").add(recipeToSave)
        .then(docRef => {
            console.log("✅ Chatbot recipe saved to Firestore with ID:", docRef.id);
            showSuccessMessage("✅ Recipe from Chef Bot saved to your account!");
            if (chatbotModalElement && typeof chatbotModalElement.remove === 'function') {
                chatbotModalElement.remove();
            }
            chatbotModalElement = null;
            currentChatbotRecipe = null;
            loadInitialRecipes();
        })
        .catch(error => {
            console.error("❌ Error saving chatbot recipe to Firestore:", error);
            alert("Failed to save the recipe from Chef Bot to your account: " + error.message);
        });
}

function showDelayedCloudSavePrompt(message) {
    // Remove any existing prompt first
    const existingPrompt = document.getElementById('cloudSavePrompt');
    if (existingPrompt) {
        bootstrap.Alert.getOrCreateInstance(existingPrompt).close();
    }

    const promptDiv = document.createElement('div');
    promptDiv.id = 'cloudSavePrompt'; // Added ID for easy removal
    promptDiv.className = 'alert alert-info alert-dismissible fade show fixed-bottom m-3 shadow-sm';
    promptDiv.role = 'alert';
    promptDiv.style.zIndex = "1055"; // Ensure it's above most things, but potentially below active modals
    promptDiv.innerHTML = `
        ${message}
        <button type="button" class="btn btn-primary btn-sm ms-3" onclick="showLoginModalAndClosePrompt(this.closest('.alert'))">Sign Up / Log In</button>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.body.appendChild(promptDiv);

    // Auto-dismiss after some time if not interacted with
    setTimeout(() => {
        const currentPrompt = document.getElementById('cloudSavePrompt');
        if (currentPrompt && currentPrompt.parentNode) { // Check if it still exists
            bootstrap.Alert.getOrCreateInstance(currentPrompt).close();
        }
    }, 15000); // 15 seconds
}

function showLoginModalAndClosePrompt(promptElement) {
    if (promptElement && typeof promptElement.remove === 'function') {
        // If using Bootstrap's Alert for dismiss, this ensures proper removal
        const alertInstance = bootstrap.Alert.getOrCreateInstance(promptElement);
        if (alertInstance) {
            alertInstance.close();
        } else {
            promptElement.remove(); // Fallback if not a BS alert
        }
    }
    showLoginModal(); // Your existing function to show the main login modal
}

function showSignInPrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex justify-content-center align-items-center';
  overlay.style.zIndex = 3000;

  const card = document.createElement('div');
  card.className = 'card shadow-lg p-4 text-center';
  card.style.maxWidth = '400px';
  card.style.width = '90%';

  card.innerHTML = `
    <h5 class="mb-3">Sign in to save recipes</h5>
    <p class="text-muted mb-4">
      Recipes you save are linked to your Google account so you can access them from any device.  
      We don’t access your email, contacts, or post anything — sign-in is only used to keep your data private and secure.
    </p>
    <div class="d-flex flex-column gap-2">
      <button class="btn btn-primary">Sign in with Google</button>
      <button class="btn btn-outline-secondary">Cancel</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const [signInBtn, cancelBtn] = card.querySelectorAll('button');

  signInBtn.onclick = () => {
    overlay.remove();
    signInWithGoogle();
  };

  cancelBtn.onclick = () => overlay.remove();

  overlay.addEventListener('click', (e) => {
    if (!card.contains(e.target)) overlay.remove();
  });
}

function showSignInPermissionsPrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex justify-content-center align-items-center';
  overlay.style.zIndex = 3000;

  const card = document.createElement('div');
  card.className = 'card shadow-lg p-4 text-center';
  card.style.maxWidth = '450px';
  card.style.width = '90%';
  card.style.overflowY = 'auto';
  card.style.maxHeight = '90vh'; // allows scrolling if needed on small screens

  card.innerHTML = `
    <h5 class="mb-3">Why we ask you to sign in</h5>

    <p class="text-muted mb-3">
      To save recipes to your account and access them from any device, we request basic Google account information:
    </p>

    <ul class="text-start mb-4">
      <li><strong>Name</strong>: Optional. Used for personalization only.</li>
      <li><strong>Email address</strong>: Required to link your recipes to your account.</li>
      <li><strong>Profile picture</strong>: Automatically included by Google but not used by us.</li>
    </ul>

    <p class="text-muted small mb-4">
      We <strong>do not</strong> access your contacts, files, or post anything to your account.
    </p>

    <div class="d-flex flex-column gap-2">
      <button class="btn btn-primary">Continue to Google Sign-In</button>
      <button class="btn btn-outline-secondary">Cancel</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const [continueBtn, cancelBtn] = card.querySelectorAll('button');

  continueBtn.onclick = () => {
    overlay.remove();
    signInWithGoogle(); // your normal sign-in flow
  };

  cancelBtn.onclick = () => overlay.remove();

  // Allow clicking outside the card to cancel too
  overlay.addEventListener('click', (e) => {
    if (!card.contains(e.target)) overlay.remove();
  });
}

// Helper function to generate HTML for recipe display (can be used by shared overlay too)
function generateRecipeDisplayHTML(recipe) {
    if (!recipe || !recipe.name) return '<p class="text-muted mt-3">Recipe details will appear here once generated.</p>';

    return `
        <h4 class="mb-3 mt-3 chatbot-recipe-name">${recipe.name}</h4>
        <div class="mb-2 chatbot-recipe-tags">
            ${(recipe.tags || []).map(tag => `<span class="badge bg-primary me-1">${tag}</span>`).join('')}
        </div>
        <table class="table table-sm table-bordered chatbot-recipe-ingredients">
            <thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th></tr></thead>
            <tbody>
                ${(recipe.ingredients || []).map(i => `
                    <tr>
                        <td>${i.name || ''}</td>
                        <td>${i.quantity || ''}</td>
                        <td>${i.unit || ''}</td>
                    </tr>
                `).join('')}
                 ${(recipe.ingredients && recipe.ingredients.length === 0) ? '<tr><td colspan="3" class="text-muted">No ingredients listed.</td></tr>' : ''}
            </tbody>
        </table>
        <p class="chatbot-recipe-instructions"><strong>Instructions:</strong> ${recipe.instructions || 'No instructions provided.'}</p>
    `;
}


function showChatbotModal() {
    // Stop any previous speech recognition and remove old modal
    if (window.chefBotSpeechRecognition && window.chefBotIsListening) {
        window.chefBotSpeechRecognition.stop();
        window.chefBotIsListening = false;
    }
    if (chatbotModalElement && chatbotModalElement.parentNode) {
        chatbotModalElement.remove();
    }
    currentChatbotRecipe = null;
    let conversationHistory = [];
    const MAX_HISTORY_TURNS = 4;

    chatbotModalElement = document.createElement('div');
    chatbotModalElement.className = 'position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex justify-content-center align-items-start overflow-auto';
    chatbotModalElement.style.zIndex = "2050";
    chatbotModalElement.style.padding = '2rem';

    const card = document.createElement('div');
    card.className = 'card shadow-lg p-3 p-md-4 position-relative';
    card.style.maxWidth = '700px';
    card.style.width = '95%';
    card.style.margin = 'auto';
    card.style.maxHeight = '90vh';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';

    card.innerHTML = `
        <div class="modal-header border-0 pb-2 pt-0">
            <h4 class="modal-title mb-0"><i class="bi bi-robot"></i> Chef Bot - AI Recipe Assistant</h4>
            <button type="button" class="btn-close" aria-label="Close"></button>
        </div>
        <div class="modal-body overflow-auto">
            <div class="mb-3">
                <label for="chatbotQueryInput" class="form-label">Describe the recipe you'd like (or click <i class="bi bi-mic-fill"></i> to use voice):</label>
                <div class="input-group">
                    <textarea class="form-control" id="chatbotQueryInput" rows="3" placeholder="e.g., 'a quick gluten-free pasta dish with shrimp and garlic'"></textarea>
                    <button class="btn btn-outline-secondary" type="button" id="chefBotMicButton" title="Use Voice Input">
                        <i class="bi bi-mic-fill"></i>
                    </button>
                </div>
                <div id="chefBotListeningStatus" class="form-text small mt-1" style="min-height: 1.2em;"></div>
            </div>
            <button id="askChefBotBtn" class="btn btn-primary w-100 mb-3">
                <i class="bi bi-magic"></i> Ask Chef Bot to Generate
            </button>
            <hr class="my-3"/>
            <div id="chatbotRecipeDisplayArea" class="mt-1">
                ${generateRecipeDisplayHTML(null)}
            </div>
        </div>
        <div class="modal-footer border-0 pt-2">
            <button id="saveChatbotRecipeBtn" class="btn btn-success" disabled><i class="bi bi-save"></i> Save to My Recipes</button>
            <button id="closeChatbotModalBtn" class="btn btn-outline-secondary">Close</button>
        </div>
    `;

    chatbotModalElement.appendChild(card);
    document.body.appendChild(chatbotModalElement);
    document.body.classList.add('modal-open-custom');

    const closeButtonX = card.querySelector('.btn-close');
    const askChefBotBtn = document.getElementById('askChefBotBtn'); // Use getElementById for reliability
    const saveChatbotRecipeBtn = document.getElementById('saveChatbotRecipeBtn');
    const closeChatbotModalBtn = card.querySelector('#closeChatbotModalBtn'); // Query within card is fine
    const chatbotQueryInput = document.getElementById('chatbotQueryInput');
    const chatbotRecipeDisplayArea = document.getElementById('chatbotRecipeDisplayArea');
    const chefBotMicButton = document.getElementById('chefBotMicButton');
    const chefBotListeningStatus = document.getElementById('chefBotListeningStatus');

    const closeModal = () => {
        if (window.chefBotSpeechRecognition && window.chefBotIsListening) {
            window.chefBotSpeechRecognition.stop();
            window.chefBotIsListening = false;
        }
        if (chatbotModalElement && chatbotModalElement.parentNode) {
            chatbotModalElement.remove();
        }
        chatbotModalElement = null;
        currentChatbotRecipe = null;
        document.body.classList.remove('modal-open-custom');
    };

    if (closeButtonX) closeButtonX.onclick = closeModal;
    if (closeChatbotModalBtn) closeChatbotModalBtn.onclick = closeModal;
    chatbotModalElement.addEventListener('click', (e) => {
        if (e.target === chatbotModalElement) closeModal();
    });

    if (askChefBotBtn && chatbotQueryInput && chatbotRecipeDisplayArea && saveChatbotRecipeBtn) {
        askChefBotBtn.onclick = async () => {
            console.log("--- askChefBotBtn CLICKED ---"); // Log 1
            const userQuery = chatbotQueryInput.value.trim();
            if (!userQuery) {
                if (chefBotListeningStatus) chefBotListeningStatus.textContent = "Please describe the recipe you want.";
                chatbotQueryInput.focus();
                return;
            }
            if (chefBotListeningStatus) chefBotListeningStatus.textContent = "";

            conversationHistory.push({ role: "user", text: userQuery });
            if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
                conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
            }

            askChefBotBtn.disabled = true;
            askChefBotBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...';
            chatbotRecipeDisplayArea.innerHTML = '<p class="text-muted text-center mt-3">Chef Bot is concocting a recipe... <i class="bi bi-hourglass-split"></i></p>';
            saveChatbotRecipeBtn.disabled = true;
            currentChatbotRecipe = null;
            console.log("askChefBotBtn: State set to generating."); // Log 2

            try {
                console.log("askChefBotBtn: About to fetch Netlify function 'generate-recipe-chat'."); // Log 3
                const response = await fetch("/.netlify/functions/generate-recipe-chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: userQuery,
                        history: conversationHistory
                    })
                });
                console.log("askChefBotBtn: Fetch response received, status:", response.status); // Log 4

                const responseText = await response.text(); // Get raw text first
                console.log("askChefBotBtn: Raw response text (first 300):", responseText.substring(0, 300)); // Log 5

                if (!response.ok) {
                    let errorData = { error: `Server error ${response.status}.` };
                    try {
                        errorData = JSON.parse(responseText); // Try to parse error from server
                    } catch (e) {
                        console.warn("Could not parse error response as JSON from generate-recipe-chat");
                        errorData.details = responseText.substring(0,200);
                    }
                    console.error("Chatbot API error response:", errorData);
                    throw new Error(errorData.error || `Chef Bot had an issue (Status: ${response.status}).`);
                }

                currentChatbotRecipe = JSON.parse(responseText);
                console.log("askChefBotBtn: Parsed currentChatbotRecipe:", currentChatbotRecipe); // Log 6

                // Add bot response to history (actual recipe JSON for generation context)
                // For history, we might want to store a simpler confirmation or just the recipe name
                conversationHistory.push({ role: "model", text: `Generated recipe: ${currentChatbotRecipe.name}` });
                 if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
                    conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
                }


                if (currentChatbotRecipe && currentChatbotRecipe.name && currentChatbotRecipe.ingredients && currentChatbotRecipe.instructions && Array.isArray(currentChatbotRecipe.tags)) {
                    chatbotRecipeDisplayArea.innerHTML = generateRecipeDisplayHTML(currentChatbotRecipe);
                    saveChatbotRecipeBtn.disabled = false; // <<<< ENABLE SAVE BUTTON
                    console.log("askChefBotBtn: Recipe displayed, save button enabled."); // Log 7
                } else {
                    console.error("Received unexpected recipe structure:", currentChatbotRecipe);
                    chatbotRecipeDisplayArea.innerHTML = `<div class="alert alert-warning text-center mt-3">Sorry, Chef Bot couldn't generate a complete recipe. ${currentChatbotRecipe.error || ''}</div>`;
                }
            } catch (error) {
                console.error("Chatbot fetch error:", error);
                chatbotRecipeDisplayArea.innerHTML = `<div class="alert alert-danger text-center mt-3">An error occurred: ${error.message}. Please try again.</div>`;
            } finally {
                askChefBotBtn.disabled = false;
                askChefBotBtn.innerHTML = '<i class="bi bi-magic"></i> Ask Chef Bot to Generate';
                console.log("askChefBotBtn: Reset after fetch (in finally block)."); // Log 8
            }
        };
    } else {
        console.error("askChefBotBtn or its dependencies not found!");
    }

    if (saveChatbotRecipeBtn && chatbotQueryInput) { // Ensure chatbotQueryInput exists for save logic as well
        console.log("saveChatbotRecipeBtn found, attaching onclick listener."); // Log A
        saveChatbotRecipeBtn.onclick = () => {
            console.log("--- saveChatbotRecipeBtn CLICKED! ---"); // Log B
            if (!currentChatbotRecipe || !currentChatbotRecipe.name) {
                alert("No valid recipe generated by Chef Bot to save.");
                console.log("saveChatbotRecipeBtn: No valid currentChatbotRecipe."); // Log C
                return;
            }
            console.log("saveChatbotRecipeBtn: Proceeding to save recipe:", currentChatbotRecipe.name); // Log D

            if (currentUser) {
                saveCurrentChatbotRecipeToFirestore();
            } else {
                if (!localDB) { alert("Local storage is not available."); return; }
                const recipeToSaveLocally = { ...currentChatbotRecipe, localId: generateLocalUUID(), timestamp: new Date().toISOString() };
                delete recipeToSaveLocally.uid;
                localDB.recipes.add(recipeToSaveLocally)
                    .then(() => {
                        showSuccessMessage("✅ Chef Bot recipe saved locally!");
                        closeModal();
                        loadInitialRecipes();
                        showDelayedCloudSavePrompt("Chef Bot recipe saved! Sign up/in to save to cloud.");
                    })
                    .catch(err => { console.error("Error saving Chef Bot recipe locally:", err); alert("Failed to save locally: " + err.message); });
            }
        };
        console.log("saveChatbotRecipeBtn: onclick listener ATTACHED."); // Log E
    } else {
        console.error("saveChatbotRecipeBtn or chatbotQueryInput not found for save logic!");
    }

    // --- Speech Recognition Logic ---
    // (Your existing full speech recognition setup - ensure all element variables
    // like chefBotMicButton, chatbotQueryInput, chefBotListeningStatus are correctly referenced)
    // ... (Ensure it's placed here) ...

    if (chatbotQueryInput) chatbotQueryInput.focus();
}

// Mock function to simulate chatbot response
function getMockChatbotRecipe(userQuery) {
    console.log("Chef Bot received query (mock):", userQuery);
    // Example: Try to make the recipe somewhat relevant to the query if it's simple
    let recipeName = "Chef Bot's Special";
    let ingredients = [
        { name: "Main Ingredient (from query)", quantity: "1", unit: "unit" },
        { name: "Spice Blend", quantity: "1", unit: "tbsp" },
        { name: "Vegetable Medley", quantity: "1", unit: "cup" },
        { name: "Aromatic Garnish", quantity: "some", unit: "" }
    ];
    let instructions = "1. Prepare the main ingredient. 2. Sauté with spice blend and vegetables. 3. Cook until done. 4. Garnish and serve.";
    let tags = ["ai-generated", "quick-idea"];

    if (userQuery.toLowerCase().includes("pasta")) {
        recipeName = "AI Pasta Primavera";
        ingredients = [
            { name: "Pasta", quantity: "200", unit: "g" },
            { name: "Mixed Vegetables (broccoli, carrots, bell peppers)", quantity: "1.5", unit: "cups" },
            { name: "Olive Oil", quantity: "2", unit: "tbsp" },
            { name: "Garlic", quantity: "2", unit: "cloves" },
            { name: "Parmesan Cheese", quantity: "1/4", unit: "cup" },
            { name: "Salt and Pepper", quantity: "to", unit: "taste" }
        ];
        instructions = "1. Cook pasta according to package directions. 2. While pasta cooks, sauté minced garlic in olive oil. Add mixed vegetables and cook until tender-crisp. 3. Drain pasta and add it to the vegetables. 4. Stir in Parmesan cheese, salt, and pepper. Serve immediately.";
        tags = ["pasta", "vegetarian", "easy", "ai-generated"];
    } else if (userQuery.toLowerCase().includes("chicken curry")) {
        recipeName = "Simple AI Chicken Curry";
        ingredients = [
            { name: "Chicken Breast (cubed)", quantity: "1", unit: "lb" },
            { name: "Onion (chopped)", quantity: "1", unit: "medium" },
            { name: "Garlic (minced)", quantity: "2", unit: "cloves" },
            { name: "Ginger (grated)", quantity: "1", unit: "tsp" },
            { name: "Curry Powder", quantity: "2", unit: "tbsp" },
            { name: "Coconut Milk", quantity: "1", unit: "can (13.5oz)" },
            { name: "Diced Tomatoes (canned)", quantity: "1", unit: "can (14.5oz)" },
            { name: "Vegetable Oil", quantity: "1", unit: "tbsp" },
            { name: "Salt", quantity: "to", unit: "taste" },
            { name: "Cilantro (chopped, for garnish)", quantity: "2", unit: "tbsp" }
        ];
        instructions = "1. Heat oil in a large pan. Add onion, cook until soft. Add garlic and ginger, cook for 1 min. 2. Stir in curry powder. Add chicken and cook until browned. 3. Pour in coconut milk and diced tomatoes. Bring to a simmer. 4. Reduce heat, cover, and cook for 15-20 mins, or until chicken is cooked through. 5. Season with salt. Garnish with cilantro. Serve with rice or naan.";
        tags = ["chicken", "curry", "dinner", "ai-generated"];
    }


    return {
        name: recipeName,
        ingredients: ingredients,
        instructions: instructions,
        tags: tags
    };
}

function saveCurrentChatbotRecipe() {
    if (!currentUser || !currentChatbotRecipe) {
        alert("Cannot save recipe. Ensure you are signed in and a recipe is generated.");
        return;
    }

    const recipeToSave = {
        ...currentChatbotRecipe, // Spread the fields from the chatbot recipe
        uid: currentUser.uid,
        timestamp: new Date(),
        // Ensure all required fields for your 'recipes' collection are present
        // If chatbot doesn't provide 'rating', 'source', etc., set defaults or leave them out if optional
        rating: currentChatbotRecipe.rating || 0, 
        // Add any other default fields your `saveRecipe` function might expect
    };

    // Validate essential fields if necessary, similar to saveRecipe()
    if (!recipeToSave.name || !recipeToSave.ingredients || recipeToSave.ingredients.length === 0) {
        alert("The generated recipe is incomplete (missing name or ingredients). Cannot save.");
        return;
    }

    db.collection("recipes").add(recipeToSave)
        .then(docRef => {
            console.log("✅ Chatbot recipe saved with ID:", docRef.id);
            showSuccessMessage("✅ Recipe from Chef Bot saved successfully!");
            if (chatbotModalElement && chatbotModalElement.parentNode) {
                chatbotModalElement.remove(); // Close modal
            }
            chatbotModalElement = null;
            currentChatbotRecipe = null;
            loadRecipesFromFirestore(); // Refresh your main recipe list
        })
        .catch(error => {
            console.error("❌ Error saving chatbot recipe:", error);
            alert("Failed to save the recipe from Chef Bot. Please try again.");
        });
}


function saveSharedRecipe(recipe) {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  const newRecipe = {
    ...recipe,
    uid: currentUser.uid,
    timestamp: new Date()
  };

  db.collection("recipes").add(newRecipe).then(() => {
    alert("✅ Recipe saved!");
    document.querySelector('.position-fixed').remove();
    loadRecipesFromFirestore();
  }).catch(err => {
    console.error("❌ Error saving shared recipe:", err);
    alert("Failed to save recipe.");
  });

  history.replaceState({}, document.title, window.location.pathname);
}


window.onload = () => {
    // The initial recipe load is now handled by onAuthStateChanged.
    // Keep other onload logic, like handling sharedId parameters.

    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('sharedId');

    if (sharedId) {
        // ... (your existing shared recipe loading logic) ...
        // This part may need to be deferred until Firebase is initialized
        // or handled within onAuthStateChanged if it relies on `db`.
        // For now, let's assume it's okay here. If it errors, move it.
        firebase.auth().onAuthStateChanged(user => { // Ensure db is ready
            if (db) { // Check if db (Firebase Firestore instance) is initialized
                db.collection('sharedRecipes').doc(sharedId).get()
                .then(doc => {
                    if (doc.exists) {
                        const sharedRecipe = doc.data();
                        showSharedOverlay(sharedRecipe);
                        history.replaceState({}, document.title, window.location.pathname);
                    } else {
                        console.error("❌ Shared recipe not found.");
                        // alert("Shared recipe not found."); // Avoid alert if onAuthStateChanged handles main load
                    }
                })
                .catch(err => {
                    console.error("❌ Error loading shared recipe:", err);
                });
            }
        });
    }
    // Removed loadRecipesFromFirestore() from here as onAuthStateChanged handles it.
};

// Define meal types with icons and descriptions
const mealTypes = [
    // Added 'tag' property for filtering
    { id: 'cook-leftovers', label: 'Cook - For Leftovers', icon: 'bi-stack', desc: 'Make a larger meal', tag: 'leftovers' },
    { id: 'cook-1day', label: 'Cook - Single Meal', icon: 'bi-egg-fried', desc: 'Standard cooking', tag: null }, // No specific tag filter
    { id: 'cook-quick', label: 'Cook - Quick Meal', icon: 'bi-stopwatch', desc: 'Under 30 mins', tag: 'quick' },
    { id: 'leftovers', label: 'Leftovers', icon: 'bi-recycle', desc: 'Eat previously cooked meal', tag: null } // Leftovers type doesn't need recipe selection
];

// Define days of the week
const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Renders the AI Weekly Planner view in #mainView.
 */
function showAIWeeklyPlanner() {
    updatePageTitle("Chef Bot Planner");
    // Optionally, keep the 'Plan' tab visually active if desired
    // setActiveNavButton("plan"); 

    const view = document.getElementById('mainView');
    if (!view) {
        console.error("mainView element not found for showAIWeeklyPlanner");
        return;
    }
    // Apply appropriate classes for styling and layout
    view.className = 'section-ai-planner bg-body-tertiary flex-grow-1 overflow-auto'; 

    // Set the HTML structure for the AI planner view
    view.innerHTML = `
    <div class="container py-3 ai-weekly-planner">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap">
            <h4 class="mb-2 mb-sm-0"><i class="bi bi-robot me-2"></i> Chef Bot Planner</h4>
            <button class="btn btn-sm btn-outline-secondary" onclick="showPlanning()">
                 <i class="bi bi-arrow-left"></i> Back to Plan
            </button>
        </div>
        <p class="text-muted mb-4">Select a cooking style for each day, then ask Chef Bot for recipe suggestions!</p>

        <div id="weeklyPlannerDays" class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3 mb-4">
            <div class="col"><div class="card h-100 placeholder-glow"><div class="card-body text-center"><span class="placeholder col-6"></span><div class="placeholder col-12 mt-2"></div></div></div></div>
            <div class="col"><div class="card h-100 placeholder-glow"><div class="card-body text-center"><span class="placeholder col-6"></span><div class="placeholder col-12 mt-2"></div></div></div></div>
            <div class="col"><div class="card h-100 placeholder-glow"><div class="card-body text-center"><span class="placeholder col-6"></span><div class="placeholder col-12 mt-2"></div></div></div></div>
        </div>

        <div class="card card-body bg-light-subtle mb-4">
            <label class="form-label fw-semibold">Chef Bot Suggestion Mode:</label>
            <div class="form-check">
                <input class="form-check-input" type="radio" name="aiSuggestionMode" id="suggestExistingRadio" value="existing" checked>
                <label class="form-check-label" for="suggestExistingRadio">
                    Suggest from My Saved Recipes
                    <small class="d-block text-muted">Prioritizes your recipes based on rating, usage, and variety.</small>
                </label>
            </div>
            <div class="form-check mt-2">
                <input class="form-check-input" type="radio" name="aiSuggestionMode" id="suggestNewRadio" value="new">
                <label class="form-check-label" for="suggestNewRadio">
                    Suggest New Recipe Ideas
                    <small class="d-block text-muted">Provides a few new ideas per day for you to choose from first.</small>
                </label>
            </div>
        </div>

        <div class="text-center">
            <button id="askChefBotForPlanBtn" class="btn btn-primary btn-lg" onclick="generatePlanWithChefBot()">
                <i class="bi bi-magic"></i> Ask Chef Bot for Suggestions
            </button>
            <div id="aiPlannerStatus" class="mt-2 small text-muted" style="min-height: 1.2em;"></div>
        </div>

        <div id="aiPlanSuggestions" class="mt-4" style="display: none;">
             <h5 class="mb-3"><i class="bi bi-lightbulb-fill text-warning"></i> Chef Bot's Suggestions:</h5>
             <p class="text-muted small">Review the suggestions below. You can accept the plan or go back to adjust your choices.</p>
             <div id="aiSuggestionsList" class="list-group mb-3">
                 </div>
             <div class="text-end mt-3">
                  <button class="btn btn-outline-secondary me-2" onclick="cancelAISuggestions()"> <i class="bi bi-arrow-left"></i> Go Back</button>
                  <button class="btn btn-success" onclick="saveGeneratedPlan()"> <i class="bi bi-check-lg"></i> Accept & Save Plan</button>
             </div>
         </div>
    </div>`;

    // Call the function to render the day cards into the #weeklyPlannerDays div
    renderDayCards();
}

/**
 * Renders the individual day cards within the planner interface.
 */
function renderDayCards() {
    const container = document.getElementById('weeklyPlannerDays');
    if (!container) return;
    container.innerHTML = ''; 

    daysOfWeek.forEach(day => {
        const dayPlan = currentWeeklyPlan[day] || { type: null, recipeId: null }; // Get current state for the day

        const col = document.createElement('div');
        col.className = 'col';

        const card = document.createElement('div');
        card.className = 'card h-100 shadow-sm planner-day-card';
        card.id = `planner-card-${day}`;

        let cardHTML = `<div class="card-header fw-bold text-center">${day}</div>`;
        cardHTML += `<div class="list-group list-group-flush">`;

        mealTypes.forEach(type => {
            const isSelected = dayPlan.type === type.id;
            // **MODIFIED**: onclick now calls toggleMealTypeSelection
            cardHTML += `
                <button type="button" 
                        class="list-group-item list-group-item-action planner-option ${isSelected ? 'active' : ''}" 
                        data-day="${day}" 
                        data-type="${type.id}"
                        onclick="toggleMealTypeSelection(this)"> 
                    <div class="d-flex w-100 justify-content-start align-items-center">
                         <i class="${type.icon} me-3 fs-5 text-primary" style="width: 20px; text-align: center;"></i> 
                         <div>
                              <h6 class="mb-0 fw-semibold">${type.label}</h6>
                              <small class="text-muted d-block">${type.desc}</small> 
                         </div>
                    </div>
                </button>`;
            
            // **NEW**: Add recipe selector area, initially hidden unless this type is active
            // Don't show selector for 'leftovers' type
            if (type.id !== 'leftovers') {
                const showSelector = isSelected; 
                cardHTML += `
                    <div class="recipe-selector-container list-group-item ${showSelector ? '' : 'd-none'}" id="selector-${day}-${type.id}">
                        <label for="recipe-select-${day}-${type.id}" class="form-label small fw-semibold">Select Recipe (Optional):</label>
                        <select class="form-select form-select-sm recipe-select-dropdown" 
                                id="recipe-select-${day}-${type.id}" 
                                data-day="${day}" 
                                data-type="${type.id}" 
                                onchange="selectRecipeForDay(this)">
                            <option value="">-- Ask Chef Bot --</option> 
                            </select>
                         <div class="form-text small">Leave blank to let Chef Bot suggest one.</div>
                    </div>`;
            }
        });

        cardHTML += `</div>`; // Close list-group
        card.innerHTML = cardHTML;
        col.appendChild(card);
        container.appendChild(col);

        // **NEW**: After card is added, populate its dropdowns if needed
        if (dayPlan.type && dayPlan.type !== 'leftovers') {
            populateRecipeSelector(day, dayPlan.type, dayPlan.recipeId);
        }
    });
}

/**
 * Handles clicking a meal type button. Updates state, toggles UI elements.
 * @param {HTMLElement} buttonElement The meal type button clicked.
 */
function toggleMealTypeSelection(buttonElement) {
    const day = buttonElement.dataset.day;
    const typeId = buttonElement.dataset.type;
    // **Ensure we target the card correctly**
    const dayCard = buttonElement.closest('.planner-day-card'); // Use closest to be safer

    if (!dayCard) {
        console.error("Could not find parent card for day:", day);
        return;
    }
    console.log("Toggling selection for Day:", day, "Type:", typeId, "Card:", dayCard); // Debug Log 1

    const currentDayPlan = currentWeeklyPlan[day] || { type: null, recipeId: null };
    const isCurrentlySelected = buttonElement.classList.contains('active');
    const isLeftovers = typeId === 'leftovers';

    // If clicking the currently active button, do nothing (or optionally, deselect)
    if (isCurrentlySelected) {
         console.log("Button already active, doing nothing."); // Debug Log 2
         return; 
    }

    // Update state - Reset recipeId when changing type
    currentWeeklyPlan[day] = { type: typeId, recipeId: isLeftovers ? undefined : null }; 
    console.log("Updated currentWeeklyPlan:", currentWeeklyPlan); // Debug Log 3

    // --- Update UI ---
    // 1. Update 'active' state for all type buttons in this card
    dayCard.querySelectorAll('.planner-option').forEach(btn => {
        const isActive = btn.dataset.type === typeId;
        btn.classList.toggle('active', isActive);
        // console.log("Button:", btn.dataset.type, "Set active:", isActive); // Verbose Debug Log
    });

    // 2. Show/Hide Recipe Selectors within this specific card
    dayCard.querySelectorAll('.recipe-selector-container').forEach(container => {
        // **Extract typeId more robustly from container's ID** // Example ID: "selector-Monday-cook-quick"
        const parts = container.id.split('-');
        const containerTypeId = parts.length > 2 ? parts.slice(2).join('-') : null; // Handles types like 'cook-leftovers'

        const shouldShow = containerTypeId === typeId && typeId !== 'leftovers';
        
        console.log("Checking Container:", container.id, "Container Type:", containerTypeId, "Target Type:", typeId, "Should Show:", shouldShow); // Debug Log 4

        container.classList.toggle('d-none', !shouldShow); // Add d-none if it should NOT show

        // 3. Populate the relevant dropdown if showing it
        if (shouldShow) {
            console.log("Populating selector for:", day, typeId); // Debug Log 5
            populateRecipeSelector(day, typeId, null); // Populate with filter, reset selection
        }
    });
    
    cancelAISuggestions(); // Reset AI suggestions view
}

/**
 * Handles the selection of a meal type button on a day card. Updates state and UI.
 * @param {HTMLElement} buttonElement The button element that was clicked.
 */
function selectMealType(buttonElement) {
    const day = buttonElement.dataset.day;
    const type = buttonElement.dataset.type;

    // Update the global state object
    currentWeeklyPlan[day] = type;

    // Update the UI only for the affected day's card
    const dayCard = document.getElementById(`planner-card-${day}`);
    if (dayCard) {
        // Find all option buttons within this specific card
        dayCard.querySelectorAll('.planner-option').forEach(btn => {
            // Check if this button's type matches the selected type
            if (btn.dataset.type === type) {
                btn.classList.add('active'); // Set the clicked button to active
            } else {
                btn.classList.remove('active'); // Remove active from other buttons in the same card
            }
        });
    }

    // Hide AI suggestions if they were previously shown, as the input has changed
    cancelAISuggestions(); // We'll define this function next
    
    // Log the current state for debugging
    console.log("Current Weekly Plan State:", currentWeeklyPlan);
}

/**
 * Hides the AI suggestion area and resets the status message.
 * To be called when meal type selection changes or user wants to go back.
 */
function cancelAISuggestions() {
     const suggestionsDiv = document.getElementById('aiPlanSuggestions');
     const statusDiv = document.getElementById('aiPlannerStatus');
     const askButton = document.getElementById('askChefBotForPlanBtn');

     if (suggestionsDiv) {
         suggestionsDiv.style.display = 'none'; // Hide the suggestions block
     }
     if (statusDiv) {
         statusDiv.textContent = ''; // Clear any status/error message
     }
     if (askButton) {
        askButton.disabled = false; // Re-enable the "Ask Chef Bot" button
     }
     aiSuggestedPlan = null; // Clear the stored suggestions
}

// *** Placeholder function - We'll implement this next ***
async function generatePlanWithChefBot() {
    const plannerStatus = document.getElementById('aiPlannerStatus');
    const askButton = document.getElementById('askChefBotForPlanBtn');
    const suggestionsDiv = document.getElementById('aiPlanSuggestions');
    const suggestionsList = document.getElementById('aiSuggestionsList');

    // **NEW: Get selected suggestion mode**
    const suggestionModeElement = document.querySelector('input[name="aiSuggestionMode"]:checked');
    const suggestionMode = suggestionModeElement ? suggestionModeElement.value : 'existing'; // Default to 'existing' if somehow none is checked
    console.log("Selected Suggestion Mode:", suggestionMode);
    // **END NEW BLOCK**

    // Basic validation (Unchanged)
    if (Object.keys(currentWeeklyPlan).length === 0) {
        if (plannerStatus) plannerStatus.textContent = "Please select a meal type for at least one day.";
        return;
    }

    if (plannerStatus) plannerStatus.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Asking Chef Bot for suggestions...';
    // ... (rest of the initial UI updates for loading state) ...

    // Prepare data payload for the backend
    const planRequest = daysOfWeek.map(day => ({
        day: day,
        type: currentWeeklyPlan[day]?.type || 'none', // Get type from state object
        // **MODIFIED: Also send pre-selected recipeId if available**
        recipeId: currentWeeklyPlan[day]?.recipeId || null // Send null if not selected
    }));
    
    // *** Data to send to the Netlify function ***
    const requestPayload = {
        planStructure: planRequest,
        suggestionMode: suggestionMode, // Add the mode
        // **NEW (Required for 'existing' mode):** Send relevant recipe metadata
        // We might only need names, tags, ratings, and maybe history data
        // For simplicity now, let's just send names/tags/ratings.
        // The backend function will need to be updated to receive and use this.
        existingRecipes: suggestionMode === 'existing' ? recipes.map(r => ({ id: r.id, name: r.name, tags: r.tags || [], rating: r.rating || 0 })) : [] 
        // OPTIONAL: Add user preferences (dietary, etc.) if available
        // userPreferences: { ... } 
    };

    try {
        // ** Call the same Netlify function, but it now needs to handle the suggestionMode **
        const response = await fetch('/.netlify/functions/generate-weekly-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload) // Send the enhanced payload
        });

        // ... (rest of the response handling - checking status, parsing JSON) ...
        
        // **MODIFIED: Handle different response types based on mode**
        const aiResponse = await response.json(); // Expect format based on mode

        if (suggestionMode === 'existing') {
            // Expect the response to be the final plan with existing recipe IDs filled in
            // Format: [{ day: 'Monday', type: 'cook-quick', recipe: { id: 'abc123', name: 'Existing Quick Pasta' } }, ...]
            aiSuggestedPlan = aiResponse; 
             if (!aiSuggestedPlan || !Array.isArray(aiSuggestedPlan)) {
                 throw new Error("Chef Bot returned an invalid plan format for existing recipes.");
             }
             // Display the final suggestions directly
             displayAISuggestions(aiSuggestedPlan, suggestionMode); 
        } else { // suggestionMode === 'new'
            // Expect the response to be IDEAS
            // Format: [{ day: 'Monday', type: 'cook-quick', ideas: ['Idea 1', 'Idea 2'] }, { day: 'Tuesday', type: 'leftovers' }, ...]
            const suggestedIdeas = aiResponse;
             if (!suggestedIdeas || !Array.isArray(suggestedIdeas)) {
                 throw new Error("Chef Bot returned an invalid ideas format.");
             }
             // Display the ideas for user selection
             displayAIPlanIdeas(suggestedIdeas); // ** NEW function needed **
             // Don't set aiSuggestedPlan yet, wait for user choices
        }

        if (plannerStatus) plannerStatus.textContent = suggestionMode === 'existing' ? "Review Chef Bot's suggestions below." : "Choose one idea for each day below.";

    } catch (error) {
        // ... (rest of error handling) ...
    } finally {
        // ... (reset button state) ...
    }
}

// *** Placeholder function - We'll implement this later ***
async function saveGeneratedPlan() {
    if (!aiSuggestedPlan) {
        alert("No plan suggestions available to save.");
        return;
    }

    const plannerStatus = document.getElementById('aiPlannerStatus');
    const saveButton = document.querySelector('#aiPlanSuggestions .btn-success'); // Find the save button
    if (plannerStatus) plannerStatus.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving plan and any new recipes...';
    if (saveButton) saveButton.disabled = true;

    let savedCount = 0;
    let errorCount = 0;
    const todayStr = new Date().toISOString().split('T')[0]; // Simple way to get date for saving

    // --- Determine Start Date (Needs Implementation) ---
    // For now, using today + day offset. Ideally, use a date picker selected by the user.
    const startDate = new Date(); // Or get from a date picker
    const dateMap = {};
    daysOfWeek.forEach((day, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index); // Simple offset, doesn't handle month/year changes perfectly for long plans
        dateMap[day] = date.toISOString().split('T')[0];
    });
    // --- End Start Date Placeholder ---


    for (const item of aiSuggestedPlan) {
        // Only save days where a recipe exists (either suggested existing or newly generated)
        if (item.recipe && item.recipe.name) {
            const dateForPlan = dateMap[item.day] || todayStr; // Use calculated date
            let recipeIdToSave = item.recipe.id || null; // Will be null for newly generated recipes initially

            // **NEW: Save newly generated recipes first**
            // We need a flag or way to know if item.recipe is new vs existing.
            // Let's assume if item.recipe.id is MISSING, it's new.
            let isNewRecipe = !item.recipe.id; 
            
            if (isNewRecipe) {
                try {
                     console.log(`Saving newly generated recipe: ${item.recipe.name}`);
                     // saveNewRecipeToStorage should return the ID of the saved recipe (Firestore or Local)
                     const savedRecipeId = await saveNewRecipeToStorage(item.recipe); 
                     if (savedRecipeId) {
                         recipeIdToSave = savedRecipeId;
                         console.log(`Saved new recipe, got ID: ${savedRecipeId}`);
                     } else {
                         throw new Error("Failed to save the new recipe itself.");
                     }
                } catch(recipeSaveError) {
                     console.error(`Error saving NEW recipe "${item.recipe.name}" before planning:`, recipeSaveError);
                     errorCount++;
                     continue; // Skip planning this item if the recipe save failed
                }
            }
             
             // Now save the planning entry with the correct recipeId
             const planEntry = {
                 date: dateForPlan, 
                 recipeName: item.recipe.name,
             };

             try {
                if (currentUser) {
                    planEntry.uid = currentUser.uid;
                    planEntry.recipeId = recipeIdToSave; // Use the (potentially new) ID
                    await db.collection("planning").add(planEntry);
                } else if (localDB) {
                    planEntry.localId = generateLocalUUID();
                    planEntry.recipeLocalId = recipeIdToSave; // Use the (potentially new) ID
                    await localDB.planning.add(planEntry);
                }
                savedCount++;
             } catch (planSaveError) {
                 console.error(`Error saving planned meal for ${item.day} (Recipe ID: ${recipeIdToSave}):`, planSaveError);
                 errorCount++;
             }
        }
    }

    // ... (rest of the summary/navigation logic from your previous saveGeneratedPlan) ...
     if (plannerStatus) plannerStatus.textContent = ''; // Clear status

    if (errorCount > 0) {
        showInfoConfirmModal("Plan Saved (with errors)", `Saved ${savedCount} meals to your plan. Failed to save ${errorCount} meals or recipes.`, [{ text: 'OK', class: 'btn-primary', dismiss: true }]);
    } else {
        showSuccessMessage(`Added ${savedCount} meals to your plan!`);
    }
    currentWeeklyPlan = {};
    aiSuggestedPlan = null;
    showPlanning(); 
}

/**
 * Displays the AI-suggested recipe IDEAS for user selection.
 * @param {Array} suggestedIdeas - The ideas structure from the AI. 
 * Format: [{ day: 'Monday', type: 'cook-quick', ideas: ['Idea A', 'Idea B'] }, ...]
 */
function displayAIPlanIdeas(suggestedIdeas) {
    const suggestionsDiv = document.getElementById('aiPlanSuggestions');
    const suggestionsList = document.getElementById('aiSuggestionsList');
    const confirmButton = suggestionsDiv ? suggestionsDiv.querySelector('.btn-success') : null; // Get the confirm/save button
    const goBackButton = suggestionsDiv ? suggestionsDiv.querySelector('.btn-outline-secondary') : null; // Get the go back button

    if (!suggestionsDiv || !suggestionsList || !confirmButton || !goBackButton) {
        console.error("Required elements for displaying AI ideas not found!");
        return;
    }

    suggestionsList.innerHTML = ''; // Clear previous content (like final suggestions)

    let ideaSelectionNeeded = false; // Track if there are actually choices to make

    suggestedIdeas.forEach((item, index) => {
        const listItem = document.createElement('div');
        listItem.className = 'list-group-item flex-column align-items-start'; // Use flex-column for layout

        const dayHeader = document.createElement('h6');
        dayHeader.className = 'mb-2 fw-bold';
        dayHeader.textContent = item.day;
        listItem.appendChild(dayHeader);

        if (item.type === 'leftovers') {
            const detailSpan = document.createElement('p');
            detailSpan.className = 'mb-0 text-muted';
            detailSpan.innerHTML = `<i class="bi bi-recycle me-2"></i> Leftovers`;
            listItem.appendChild(detailSpan);
        } else if (item.ideas && Array.isArray(item.ideas) && item.ideas.length > 0) {
            ideaSelectionNeeded = true; // Mark that we have choices
            const mealTypeInfo = mealTypes.find(mt => mt.id === item.type);
            const typeLabel = mealTypeInfo ? `(${mealTypeInfo.label})` : '';

            const ideaForm = document.createElement('div');
            ideaForm.className = 'ms-3'; // Indent the choices slightly
            ideaForm.innerHTML = `<p class="mb-1 small text-muted">Choose an idea ${typeLabel}:</p>`;

            item.ideas.forEach((idea, ideaIndex) => {
                const radioId = `idea-${item.day}-${ideaIndex}`;
                const radioName = `idea-choice-${item.day}`; // Unique name per day group

                const formCheck = document.createElement('div');
                formCheck.className = 'form-check';
                formCheck.innerHTML = `
                    <input class="form-check-input ai-idea-radio" 
                           type="radio" 
                           name="${radioName}" 
                           id="${radioId}" 
                           value="${escapeHtml(idea)}" 
                           data-day="${item.day}"
                           ${ideaIndex === 0 ? 'checked' : ''}> 
                    <label class="form-check-label" for="${radioId}">
                        ${escapeHtml(idea)}
                    </label>
                `;
                ideaForm.appendChild(formCheck);
            });
            listItem.appendChild(ideaForm);

        } else { // No ideas provided for a 'cook' day
            const detailSpan = document.createElement('p');
            detailSpan.className = 'mb-0 text-warning';
            detailSpan.innerHTML = `<i class="bi bi-question-circle me-2"></i> No specific ideas suggested by Chef Bot.`;
            listItem.appendChild(detailSpan);
        }

        suggestionsList.appendChild(listItem);
    });

    // **Update the confirm button text and action**
    confirmButton.textContent = 'Confirm Choices & Generate Recipes';
    confirmButton.onclick = generateFullRecipesFromIdeas; // Point to the next step function

    // Ensure the "Go Back" button still works correctly
    goBackButton.onclick = cancelAISuggestions; 

    // Show the suggestions area
    suggestionsDiv.style.display = 'block';

    // Disable confirm button if there were no actual ideas to choose from
    confirmButton.disabled = !ideaSelectionNeeded;
}

/**
 * Gathers chosen ideas and requests full recipes from the backend.
 */
async function generateFullRecipesFromIdeas() {
    const suggestionsList = document.getElementById('aiSuggestionsList');
    const plannerStatus = document.getElementById('aiPlannerStatus');
    const confirmButton = document.querySelector('#aiPlanSuggestions .btn-success'); 
    if (!suggestionsList || !plannerStatus || !confirmButton) return;

    const chosenIdeas = [];
    const checkedRadios = suggestionsList.querySelectorAll('.ai-idea-radio:checked');

    checkedRadios.forEach(radio => {
        // Find the original type associated with this day
        const day = radio.dataset.day;
        const originalType = currentWeeklyPlan[day]?.type || 'cook-1day'; // Default if somehow missing
        
        chosenIdeas.push({
            day: day,
            chosenIdea: radio.value,
            type: originalType // Send the original type back for context
        });
    });

    console.log("User chose these ideas:", chosenIdeas);

    if (chosenIdeas.length === 0) {
        alert("Please select at least one recipe idea to generate.");
        return;
    }

    // --- UI Update: Show Loading State ---
    plannerStatus.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generating full recipes from choices...';
    confirmButton.disabled = true;
    confirmButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generating...';
    suggestionsList.querySelectorAll('.ai-idea-radio').forEach(radio => radio.disabled = true);

    // --- Actual Backend Call ---
    try {
        // *** This needs a NEW Netlify function: '/.netlify/functions/generate-recipes-from-ideas' ***
        const response = await fetch('/.netlify/functions/generate-recipes-from-ideas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send the array of chosen ideas { day, chosenIdea, type }
            body: JSON.stringify({ chosenIdeas: chosenIdeas }) 
        });

        console.log("generateFullRecipesFromIdeas: Fetch response received, status:", response.status);

        const responseText = await response.text(); // Get raw text first
        console.log("generateFullRecipesFromIdeas: Raw response text (first 300):", responseText.substring(0, 300)); 

        if (!response.ok) {
            let errorData = { error: `Server error ${response.status}.` };
            try { errorData = JSON.parse(responseText); } catch (e) { errorData.details = responseText.substring(0,200); }
            console.error("generate-recipes-from-ideas API error:", errorData);
            throw new Error(errorData.error || `Chef Bot had an issue generating full recipes (Status: ${response.status}).`);
        }

        // Expect the response to be the final plan with full recipe details
        // Format: [{ day: 'Monday', type: '...', recipe: { name: '...', ingredients: [...], ... } }, ...]
        const fullRecipesPlan = JSON.parse(responseText);

        if (!fullRecipesPlan || !Array.isArray(fullRecipesPlan)) {
             throw new Error("Chef Bot returned an invalid format for full recipes.");
        }
        
        // Add back any days that were 'leftovers' or had no selection/idea chosen
        const finalPlanMap = new Map(fullRecipesPlan.map(item => [item.day, item]));
        daysOfWeek.forEach(day => {
            if (!finalPlanMap.has(day)) {
                 const originalPlan = currentWeeklyPlan[day];
                 if (originalPlan && originalPlan.type === 'leftovers') {
                     finalPlanMap.set(day, { day: day, type: 'leftovers' });
                 } else if (originalPlan && originalPlan.recipeId) {
                     // If a recipe was pre-selected, it should still be included
                     const existingRecipe = recipes.find(r => r.id === originalPlan.recipeId);
                     if (existingRecipe) {
                         finalPlanMap.set(day, { day: day, type: originalPlan.type, recipe: { id: existingRecipe.id, name: existingRecipe.name } });
                     } else {
                          finalPlanMap.set(day, { day: day, type: originalPlan.type || 'none', recipe: null }); // Fallback if pre-selected recipe not found
                     }
                 }
                 else {
                     finalPlanMap.set(day, { day: day, type: originalPlan?.type || 'none', recipe: null }); // Ensure all days are present
                 }
            }
        });

        // Convert map back to array and sort
        aiSuggestedPlan = Array.from(finalPlanMap.values());
        aiSuggestedPlan.sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day));


        console.log("Received and processed full recipes:", aiSuggestedPlan);

        // --- Display Final Suggestions ---
        displayAISuggestions(aiSuggestedPlan, 'new'); // Call the display function for the final review
        plannerStatus.textContent = "Review the generated recipes below.";
        
        // The confirm button in displayAISuggestions is already set up to call saveGeneratedPlan()

    } catch (error) {
        console.error("Error generating full recipes:", error);
        plannerStatus.textContent = `Error: ${error.message}`;
         // Re-enable UI elements on error
        confirmButton.disabled = false;
        confirmButton.innerHTML = 'Confirm Choices & Generate Recipes';
         suggestionsList.querySelectorAll('.ai-idea-radio').forEach(radio => radio.disabled = false);
    }
    // --- End Backend Call ---
}

// **Modify displayAISuggestions slightly to handle the 'mode' for clarity (optional)**
/**
 * Displays the AI-suggested recipes (either existing or newly generated) for user review.
 * @param {Array} suggestedPlan - The plan structure with recipe details.
 * @param {string} mode - 'existing' or 'new' to adjust text slightly (optional).
 */
function displayAISuggestions(suggestedPlan, mode = 'existing') { // Added mode parameter
    const suggestionsDiv = document.getElementById('aiPlanSuggestions');
    const suggestionsList = document.getElementById('aiSuggestionsList');
    const confirmButton = suggestionsDiv ? suggestionsDiv.querySelector('.btn-success') : null;
    const goBackButton = suggestionsDiv ? suggestionsDiv.querySelector('.btn-outline-secondary') : null;
     const titleElement = suggestionsDiv ? suggestionsDiv.querySelector('h5') : null; // Get the title element


    if (!suggestionsDiv || !suggestionsList || !confirmButton || !goBackButton || !titleElement) return;

    suggestionsList.innerHTML = ''; 
    
    // Update title based on mode
     titleElement.innerHTML = `<i class="bi bi-lightbulb-fill text-warning"></i> Chef Bot's ${mode === 'new' ? 'Generated Plan' : 'Suggestions'}:`;


    suggestedPlan.forEach(item => {
        // ... (rest of the logic from your previous displayAISuggestions to render the list item) ...
         const listItem = document.createElement('div');
        listItem.className = 'list-group-item d-flex justify-content-between align-items-center';

        const daySpan = document.createElement('span');
        daySpan.className = 'fw-bold me-3';
        daySpan.textContent = item.day;

        const detailSpan = document.createElement('span');
        detailSpan.className = 'flex-grow-1 text-end'; 

        if (item.type === 'leftovers') {
            detailSpan.innerHTML = `<i class="bi bi-recycle me-2"></i> Leftovers`;
            detailSpan.classList.add('text-muted');
        } else if (item.recipe && item.recipe.name) {
             // Find original meal type icon
             const mealTypeInfo = mealTypes.find(mt => mt.id === item.type);
             const iconClass = mealTypeInfo ? mealTypeInfo.icon : 'bi-egg'; // Default icon
             detailSpan.innerHTML = `<i class="${iconClass} me-2"></i> ${escapeHtml(item.recipe.name)}`;
             // Maybe add a tooltip or small button here later to view recipe details?
        } else {
             detailSpan.innerHTML = `<i class="bi bi-question-circle me-2"></i> No suggestion provided`;
             detailSpan.classList.add('text-warning');
        }

        listItem.appendChild(daySpan);
        listItem.appendChild(detailSpan);
        suggestionsList.appendChild(listItem);
    });

    // **Ensure the confirm button now triggers the FINAL save**
    confirmButton.textContent = 'Accept & Save Plan';
    confirmButton.onclick = saveGeneratedPlan; 
    confirmButton.disabled = false; // Ensure it's enabled

    goBackButton.onclick = cancelAISuggestions; 

    suggestionsDiv.style.display = 'block';
}