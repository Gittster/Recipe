let recipes = [];
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

/**
 * Clears or populates the #recipeFormModal fields.
 * If recipeData is provided, it populates. Otherwise, it clears for a new entry.
 * @param {object|null} recipeData - Recipe data to load into the form, or null to clear.
 */
function clearRecipeFormModal(recipeData = null) {
    const nameInput = document.getElementById('modalRecipeNameInput');
    const ingredientsTable = document.getElementById('modalIngredientsTable');
    const instructionsInput = document.getElementById('modalRecipeInstructionsInput');
    const tagInput = document.getElementById('modalTagInput');
    const errorDiv = document.getElementById('recipeFormModalError'); // Ensure this ID is in your modal HTML

    if (nameInput) nameInput.value = recipeData?.name || '';
    if (instructionsInput) instructionsInput.value = recipeData?.instructions || '';
    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }

    currentModalTags = recipeData?.tags ? [...recipeData.tags] : [];
    if (typeof renderModalTags === "function") {
        renderModalTags();
    } else {
        console.warn("renderModalTags function is not defined for recipeFormModal.");
    }
    if (tagInput) tagInput.value = '';

    if (ingredientsTable) {
        ingredientsTable.innerHTML = ''; // Clear existing ingredient rows
        if (recipeData && recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
            recipeData.ingredients.forEach(ing => {
                if (typeof createIngredientRowForModal === "function") {
                    createIngredientRowForModal(ing.name, ing.quantity, ing.unit);
                } else { console.warn("createIngredientRowForModal is not defined, cannot populate ingredients.");}
            });
        }
        // Always add one blank row for manual entry, or if AI returns no ingredients
        if (typeof createIngredientRowForModal === "function") {
             createIngredientRowForModal(); // Add a blank row for new input
        }
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

/**
 * Prepares and shows the recipe form modal (#recipeFormModal).
 * If recipeDataToLoad is provided, it populates the form. Otherwise, sets up a blank form.
 * @param {object|null} recipeDataToLoad - Recipe data to load, or null for a new recipe.
 * @param {string} [mode='new'] - 'new', 'review-ai', or 'edit'.
 */
function openRecipeFormModal(recipeDataToLoad = null, mode = 'new') {
    const modalLabel = document.getElementById('recipeFormModalLabel');
    const saveButton = document.getElementById('saveRecipeFromModalBtn');

    if (mode === 'review-ai' && recipeDataToLoad) {
        if(modalLabel) modalLabel.innerHTML = '<i class="bi bi-magic me-2"></i>Review AI Generated Recipe';
        if(saveButton) saveButton.textContent = 'Save This AI Recipe';
        clearRecipeFormModal(recipeDataToLoad); // Populate with AI data
    } else { // Default to new manual entry
        if(modalLabel) modalLabel.innerHTML = '<i class="bi bi-keyboard me-2"></i>Add Recipe Manually';
        if(saveButton) saveButton.textContent = 'Save Recipe';
        clearRecipeFormModal(null); // Clear for new manual entry
    }

    if (typeof initializeModalRecipeFormTagInput === "function") {
        initializeModalRecipeFormTagInput();
    } else {
        console.warn("initializeModalRecipeFormTagInput is not defined.");
    }

    if (recipeFormModalInstance) {
        recipeFormModalInstance.show();
        const nameInput = document.getElementById('modalRecipeNameInput');
        if(nameInput) nameInput.focus();
    } else {
        console.error("Recipe Form Modal (#recipeFormModal) not initialized.");
    }
}

/**
 * Reads data from the #recipeFormModal and saves it as a new recipe.
 */
async function saveRecipeFromModal() {
    const name = document.getElementById('modalRecipeNameInput')?.value.trim();
    const instructions = document.getElementById('modalRecipeInstructionsInput')?.value.trim();
    const ingredients = [];
    const errorDiv = document.getElementById('recipeFormModalError');
    
    if(errorDiv) {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }

    document.querySelectorAll('#modalIngredientsTable .ingredient-form-row').forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 3) {
            const ingName = inputs[0].value.trim();
            const qty = inputs[1].value.trim();
            const unit = inputs[2].value.trim();
            if (ingName) {
                ingredients.push({ name: ingName, quantity: qty, unit: unit });
            }
        }
    });

    if (!name) {
        const msg = "Recipe name cannot be empty.";
        if(errorDiv) { errorDiv.textContent = msg; errorDiv.style.display = 'block'; } else { alert(msg); }
        document.getElementById('modalRecipeNameInput')?.focus();
        return;
    }
    // Optionally, check for ingredients:
    // if (ingredients.length === 0) {
    //     const msg = "Please add at least one ingredient.";
    //     if(errorDiv) { errorDiv.textContent = msg; errorDiv.style.display = 'block'; } else { alert(msg); }
    //     return;
    // }

    const recipeData = {
        name,
        ingredients,
        instructions: instructions || "", // Ensure instructions is at least an empty string
        tags: [...currentModalTags],    // Use tags from the modal's state
        rating: 0,                      // Default for new recipes
    };

    const success = await saveNewRecipeToStorage(recipeData); // Your generic save function

    if (success) {
        if (recipeFormModalInstance) recipeFormModalInstance.hide(); 
        // clearRecipeFormModal() will be called by 'hidden.bs.modal' event listener for #recipeFormModal
    } else {
        const msg = "Failed to save recipe. Please try again.";
        if(errorDiv && (!errorDiv.textContent || errorDiv.style.display === 'none')) { // Don't overwrite specific error from saveNewRecipeToStorage
            errorDiv.textContent = msg; 
            errorDiv.style.display = 'block'; 
        }
        // saveNewRecipeToStorage likely showed an alert already
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
        if (textarea) textarea.value = '📛 RECIPE NAME\n====================\n\n🧂 INGREDIENTS\n====================\n\n📝 INSTRUCTIONS\n===================='; // Reset template
        if (statusDiv) statusDiv.innerHTML = '';
        pasteTextModalInstance.show();
    } else {
        console.error("Paste Text Modal not initialized.");
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
                button.textContent = btnConfig.text;
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

function handleOCRImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async function (e) {
    const base64Data = e.target.result.split(',')[1]; // Remove data:image prefix

    try {
      const response = await fetch("https://beamish-baklava-a99968.netlify.app/.netlify/functions/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ base64: base64Data })
      });

      const ocrResult = await response.json();
      console.log("🧠 OCR Result:", ocrResult);

      const parsed = extractRecipeFromDoctr(ocrResult);
      fillRecipeForm(parsed);
    } catch (err) {
      console.error("❌ OCR call failed:", err);
      alert("OCR failed — check the console for details.");
    }
  };

  reader.readAsDataURL(file);
}

function extractRecipeFromDoctr(response) {
  const blocks = response?.[0]?.pages?.[0]?.blocks || [];

  const lines = blocks.flatMap(block =>
    block.lines.map(line =>
      line.words.map(word => word.value).join(' ')
    )
  );

  const fullText = lines.join('\n');
  console.log("🔎 Extracted Text:", fullText);

  // 👇 Use your existing logic to parse the text into a recipe object
  return parseOcrToRecipeFields(fullText);
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
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div> 
                <button class="btn btn-outline-warning btn-sm me-2" type="button" onclick="showChatbotModal()" title="Ask Chef Bot to create a new recipe">
                    <i class="bi bi-robot"></i> Chef Bot
                </button>
                <button class="btn btn-outline-info btn-sm me-2" type="button" data-bs-toggle="collapse" data-bs-target="#recipeFiltersCollapse" aria-expanded="false" aria-controls="recipeFiltersCollapse" title="Toggle filters">
                    <i class="bi bi-funnel-fill"></i> Filters
                </button>
                <button class="btn btn-primary btn-sm" onclick="openAddRecipeMethodChoiceModal()">
                    <i class="bi bi-plus-circle-fill me-1"></i>Add Recipe
                </button>
            </div>
        </div>

        <div class="collapse mb-3" id="recipeFiltersCollapse">
            <div class="filter-section card card-body bg-light-subtle">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">Filter & Search</h6>
                    <button class="btn btn-outline-secondary btn-sm" type="button" onclick="clearAllRecipeFilters()" title="Clear all filters">
                        <i class="bi bi-x-lg"></i> Clear All
                    </button>
                </div>
                <div class="row g-2 align-items-end">
                    <div class="col-lg-4 col-md-12">
                        <label for="nameSearch" class="form-label small mb-1">By Name:</label>
                        <input type="text" class="form-control form-control-sm" id="nameSearch" placeholder="Search by recipe name..." oninput="applyAllRecipeFilters()" />
                    </div>
                    <div class="col-lg-4 col-md-6">
                        <label for="recipeSearch" class="form-label small mb-1">By Ingredient(s):</label>
                        <input type="text" class="form-control form-control-sm" id="recipeSearch" placeholder="e.g., chicken,tomato" oninput="applyAllRecipeFilters()" />
                    </div>
                    <div class="col-lg-4 col-md-6">
                        <label for="tagSearch" class="form-label small mb-1">By Tag(s):</label>
                        <input type="text" class="form-control form-control-sm" id="tagSearch" placeholder="e.g., dinner,quick" oninput="applyAllRecipeFilters()" />
                    </div>
                </div>
            </div>
        </div>

        <div id="recipeForm" class="collapsible-form mb-4">
            ${getAddRecipeFormHTML()}
        </div>

        <div id="recipeResults"></div>
    `;

    initializeMainRecipeFormTagInput();

    if (typeof recipes !== 'undefined' && typeof applyAllRecipeFilters === "function") {
        applyAllRecipeFilters();
    } else {
        const recipeResultsContainer = document.getElementById('recipeResults');
        if (recipeResultsContainer) {
            recipeResultsContainer.innerHTML = '<p class="text-center text-muted">Loading recipes or no recipes found...</p>';
        }
        if (typeof recipes === 'undefined') {
            console.warn("Global 'recipes' array not defined when showRecipeFilter was called. Ensure loadInitialRecipes() has run or will run.");
        }
        if (typeof applyAllRecipeFilters !== "function") {
            console.error("CRITICAL: applyAllRecipeFilters function is not defined!");
        }
    }
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

function initializeMainRecipeFormTagInput() {
    const tagInput = document.getElementById('tagInput');
    const tagAddButton = document.getElementById('tagAddButton');
    
    // currentTags should be reset when a new recipe form is opened/cleared by toggleRecipeForm
    if (tagInput && tagAddButton) {
        // To avoid multiple listeners if this is called many times without DOM replacement,
        // consider using a flag or removing old listeners.
        // For now, assuming simple re-assignment if DOM is stable or re-rendered.
        const addTagFromMainForm = () => {
            const value = tagInput.value.trim().toLowerCase();
            if (value && !currentTags.includes(value)) {
                currentTags.push(value);
                renderTags(); // This updates #tagsContainer in the Add Recipe form
            }
            tagInput.value = '';
            tagInput.focus();
        };
        
        tagAddButton.onclick = addTagFromMainForm;
        // Remove previous listener before adding a new one to prevent duplication if this func is called multiple times on same elements
        tagInput.removeEventListener('keypress', handleTagInputKeypress); // Named function for removal
        tagInput.addEventListener('keypress', handleTagInputKeypress);

    }
}

function handleTagInputKeypress(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('tagAddButton').click(); // Trigger the button's click
    }
}

function handlePastedRecipeText() {
  const textarea = document.getElementById('ocrTextPaste');
  if (!textarea) return;

  const text = textarea.value.trim();
  if (!text) {
    alert("Please paste a recipe first.");
    return;
  }

  const parsed = parseOcrToRecipeFields(text);
  fillRecipeForm(parsed);
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



function createIngredientRow(name = '', qty = '', unit = '') {
  const row = document.createElement('div');
  row.className = 'row g-2 align-items-center mb-2';

  const nameCol = document.createElement('div');
  nameCol.className = 'col-6';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Ingredient';
  nameInput.className = 'form-control';
  nameInput.value = name;
  nameCol.appendChild(nameInput);

  const qtyCol = document.createElement('div');
  qtyCol.className = 'col-2 position-relative d-flex align-items-center';
  const qtyInput = document.createElement('input');
  qtyInput.type = 'text';
  qtyInput.placeholder = 'Qty';
  qtyInput.className = 'form-control';
  qtyInput.value = qty;
  qtyCol.appendChild(qtyInput);

  const unitCol = document.createElement('div');
  unitCol.className = 'col-3';
  const unitInput = document.createElement('input');
  unitInput.type = 'text';
  unitInput.placeholder = 'Unit';
  unitInput.className = 'form-control';
  unitInput.value = unit;
  unitCol.appendChild(unitInput);

  // ✅ Delete column (1 col wide)
  const deleteCol = document.createElement('div');
  deleteCol.className = 'col-1 d-flex justify-content-center align-items-center';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-sm btn-outline-danger';
  deleteBtn.innerHTML = '🗑️';
  deleteBtn.title = 'Remove this ingredient';

  deleteBtn.onclick = () => {
    row.remove();
  };

  deleteCol.appendChild(deleteBtn);

  // Assemble row
  row.appendChild(nameCol);
  row.appendChild(qtyCol);
  row.appendChild(unitCol);
  row.appendChild(deleteCol);

  document.getElementById('ingredientsTable').appendChild(row);

  // Add new blank row when the last one is filled
  [nameInput, qtyInput, unitInput].forEach(input => {
    input.addEventListener('input', () => {
      const isLastRow = row === document.getElementById('ingredientsTable').lastElementChild;
      const filled = nameInput.value && qtyInput.value && unitInput.value;
      if (isLastRow && filled) createIngredientRow();
    });
  });
}

// script.js

// Assume 'recipes' is your globally accessible array of all loaded recipe objects
// let recipes = [];

function filterRecipesByName() {
    const nameSearchTerm = document.getElementById('nameSearch') ? 
                           document.getElementById('nameSearch').value.toLowerCase().trim() : "";
    
    let filteredByName = [...recipes]; // Start with all recipes

    if (nameSearchTerm) {
        filteredByName = recipes.filter(recipe =>
            recipe.name && recipe.name.toLowerCase().includes(nameSearchTerm)
        );
    }

    // To make this new name filter work *with* your existing independent filters,
    // you have a few choices for how they interact:
    // Option A: Name filter overrides others temporarily (simplest for now if you want ONLY name filter active when typing in it)
    // Option B: Try to combine filter results (more complex if they are triggered by separate oninput)
    //
    // For now, let's assume typing in "Filter by name" shows results *only* based on name,
    // and typing in "Filter by ingredient" shows results *only* based on ingredients, etc.
    // If you want them to be additive (e.g., name AND ingredient), we'll need a single `applyAllFilters()` function.

    // For this request (just make filter by name work without changing other filters' current behavior):
    // We will re-filter based on ALL current filter inputs every time any filter changes.
    // This is the most robust way to make them work together.

    // Get values from other filters as well
    const ingredientSearchTerm = document.getElementById('recipeSearch') ?
                                 document.getElementById('recipeSearch').value.toLowerCase().trim() : "";
    const tagSearchTerm = document.getElementById('tagSearch') ?
                          document.getElementById('tagSearch').value.toLowerCase().trim() : "";

    applyAllRecipeFilters(); // We will create this new function
}

// It's better to have ONE function that applies ALL active filters.
// Let's rename your existing filterByText and filterByTag to be part of a combined filter.

function filterRecipesByText() { // This will now be triggered by ingredient search input
    applyAllRecipeFilters();
}

function filterRecipesByTag() { // This will now be triggered by tag search input
    applyAllRecipeFilters();
}


// script.js

function applyAllRecipeFilters() {
    const nameSearchInput = document.getElementById('nameSearch'); // ID from your HTML
    const ingredientSearchInput = document.getElementById('recipeSearch'); // ID from your HTML
    const tagSearchInput = document.getElementById('tagSearch'); // ID from your HTML

    const nameSearchTerm = nameSearchInput ? nameSearchInput.value.toLowerCase().trim() : "";
    const ingredientSearchValue = ingredientSearchInput ? ingredientSearchInput.value.toLowerCase().trim() : "";
    const ingredientSearchTermsArray = ingredientSearchValue.split(',')
                                     .map(term => term.trim().toLowerCase())
                                     .filter(Boolean);
    const tagSearchValue = tagSearchInput ? tagSearchInput.value.toLowerCase().trim() : "";
    const tagTermsArray = tagSearchValue.split(',')
                        .map(t => t.trim().toLowerCase())
                        .filter(Boolean);

    let filteredList = [...recipes]; // Start with a fresh copy of all recipes

    if (nameSearchTerm) {
        filteredList = filteredList.filter(recipe =>
            recipe.name && recipe.name.toLowerCase().includes(nameSearchTerm)
        );
    }

    if (ingredientSearchTermsArray.length > 0) {
        filteredList = filteredList.filter(recipe => {
            if (!recipe.ingredients || recipe.ingredients.length === 0) return false;
            const ingredientNamesLower = recipe.ingredients.map(ing => {
                const name = (typeof ing === 'object' && ing.name) ? ing.name : (typeof ing === 'string' ? ing : '');
                return name.toLowerCase();
            });
            return ingredientSearchTermsArray.every(term =>
                ingredientNamesLower.some(ingName => ingName.includes(term))
            );
        });
    }

    if (tagTermsArray.length > 0) {
        filteredList = filteredList.filter(recipe => {
            if (!recipe.tags || recipe.tags.length === 0) return false;
            const recipeTagsLower = recipe.tags.map(tag => tag.toLowerCase());
            return tagTermsArray.every(term =>
                recipeTagsLower.some(tag => tag.includes(term)) // Using 'includes' for tags as well
            );
        });
    }
    
    const displayOptions = {};
    if (nameSearchTerm) displayOptions.highlightNameTerm = nameSearchTerm;
    if (ingredientSearchTermsArray.length > 0) displayOptions.highlightIngredients = ingredientSearchTermsArray;
    if (tagTermsArray.length > 0) displayOptions.highlightTags = tagTermsArray;

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
    console.log("--- handlePastedRecipeTextFromModal called ---");
    const textarea = document.getElementById('ocrTextPasteInputModal');
    const statusDiv = document.getElementById('pasteParseStatus');

    if (!textarea) {
        console.error("Paste textarea (#ocrTextPasteInputModal) not found!");
        if(statusDiv) statusDiv.textContent = "Error: Text area element missing.";
        return;
    }
    if (!statusDiv) {
        console.warn("Paste status div (#pasteParseStatus) not found.");
    }

    const text = textarea.value.trim();
    if (!text) {
        if(statusDiv) {
            statusDiv.textContent = "Please paste recipe text first.";
            statusDiv.className = "form-text small mt-2 text-danger";
        } else {
            alert("Please paste recipe text first.");
        }
        textarea.focus();
        return;
    }

    if (statusDiv) {
        statusDiv.className = "form-text small mt-2 text-info"; // Reset class
        statusDiv.innerHTML = '🤖 Parsing text with AI... <span class="spinner-border spinner-border-sm"></span>';
    }

    // Here, you would ideally send the 'text' to a Netlify function that uses Gemini
    // to parse it into a structured recipe, similar to how process-recipe-image works.
    // For now, I'll assume your client-side parseOcrToRecipeFields is used or you adapt it.
    // Let's simulate an async operation as if calling an AI.
    try {
        // const response = await fetch("/.netlify/functions/parse-pasted-text", {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({ recipeText: text })
        // });
        // const parsedRecipeData = await response.json();
        // if (!response.ok || parsedRecipeData.error) {
        //     throw new Error(parsedRecipeData.error || `Failed to parse text (status ${response.status})`);
        // }

        // Using your existing client-side parser for now:
        console.log("Parsing pasted text using client-side parseOcrToRecipeFields.");
        const parsedRecipeData = parseOcrToRecipeFields(text); // Your existing parser

        if (!parsedRecipeData || !parsedRecipeData.name) { // Changed from .title to .name
            throw new Error("Could not extract a recipe name from the pasted text.");
        }
        // Ensure standard recipe object structure
        parsedRecipeData.tags = parsedRecipeData.tags || [];
        parsedRecipeData.ingredients = parsedRecipeData.ingredients || [];
        parsedRecipeData.instructions = parsedRecipeData.instructions || "";


        console.log("Pasted text parsed successfully into recipeData:", parsedRecipeData);

        if (pasteTextModalInstance && typeof pasteTextModalInstance.hide === 'function') {
            pasteTextModalInstance.hide(); // Hide the paste modal
        }
        
        // Open the main recipe form modal with the parsed data for review
        if (typeof openRecipeFormModal === "function") {
            openRecipeFormModal(parsedRecipeData, 'review-ai');
        } else {
            console.error("openRecipeFormModal function not defined! Cannot display parsed recipe.");
            alert("Recipe text parsed, but cannot display it for review.");
        }

    } catch (error) {
        console.error("Error parsing pasted recipe text:", error);
        if(statusDiv) {
            statusDiv.textContent = `Error: ${error.message}`;
            statusDiv.className = "form-text small mt-2 text-danger";
        } else {
            alert(`Error parsing text: ${error.message}`);
        }
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






function fillRecipeForm(recipe) {
  const nameInput = document.getElementById('recipeNameInput');
  const instructionsInput = document.getElementById('recipeInstructionsInput');
  const ingredientsTable = document.getElementById('ingredientsTable');

  if (nameInput) nameInput.value = recipe.title || '';
  if (instructionsInput) instructionsInput.value = recipe.instructions || '';

  if (ingredientsTable) {
    ingredientsTable.innerHTML = '';
    recipe.ingredients.forEach(i => {
      createIngredientRow(i.name, i.quantity, i.unit);
    });
    createIngredientRow(); // Add blank row at end
  }
}


function stripBase64Header(dataUrl) {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}


function runOCRFromImage(src) {
  const preview = document.getElementById('photoPreviewContainer');
  preview.innerHTML = ''; // Clear any previous content

  const status = document.createElement('p');
  status.textContent = '🔍 Scanning text...';
  preview.appendChild(status);

  Tesseract.recognize(src, 'eng', {
    logger: m => console.log(m),
    config: {
      tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:,.()/- ',
      tessedit_pageseg_mode: '13'
    }
  }).then(({ data: { text } }) => {
    status.remove();

    // 📝 Textarea for editable OCR result
    const textarea = document.createElement('textarea');
    textarea.className = 'form-control mb-2';
    textarea.id = 'ocrTextArea';
    textarea.rows = 10;
    textarea.value = text;
    preview.appendChild(textarea);

    // 🔘 Button to parse the editable OCR result
    const parseBtn = document.createElement('button');
    parseBtn.className = 'btn btn-info btn-sm btn-outline-dark mt-2';
    parseBtn.textContent = '✨ Parse OCR Text to Fill Form';

    parseBtn.onclick = () => {
      const updatedText = document.getElementById('ocrTextArea').value;
      const parsed = parseOcrToRecipeFields(updatedText);
      fillRecipeForm(parsed);
    };
    console.log("✅ OCR Parse button being added!");
    preview.appendChild(parseBtn);
  }).catch(err => {
    console.error("OCR error:", err);
    status.textContent = '❌ OCR failed.';
  });
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





async function saveRecipe() { // Changed to async to handle potential async local save
    const name = document.getElementById('recipeNameInput').value.trim();
    const instructions = document.getElementById('recipeInstructionsInput').value.trim();
    // ... (get ingredients and tags as before) ...
    const rows = document.querySelectorAll('#ingredientsTable > .row');
    const ingredients = [];
    currentTags = currentTags || []; // Ensure currentTags is initialized

    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const ingName = inputs[0]?.value.trim();
        const qty = inputs[1]?.value.trim();
        const unit = inputs[2]?.value.trim();
        if (ingName) {
            ingredients.push({ name: ingName, quantity: qty || '', unit: unit || '' });
        }
    });

    if (!name || ingredients.length === 0) {
        // ... (your existing error display for missing name/ingredients) ...
        const error = document.getElementById('recipeErrorMessage') || document.createElement('div');
        // ...
        return;
    }

    const recipeData = {
        // id: will be generated by Firebase or locally
        name,
        instructions,
        ingredients,
        tags: currentTags, // Use the globally managed currentTags
        timestamp: new Date(), // Will be Firestore Timestamp or ISO string locally
        // rating: 0, // Default rating if you have this field
    };

    if (currentUser) { // User is LOGGED IN - Save to Firebase
        console.log("User logged in, saving recipe to Firestore:", recipeData);
        recipeData.uid = currentUser.uid;
        // Ensure timestamp is a Firestore server timestamp for consistency if desired
        // recipeData.timestamp = firebase.firestore.FieldValue.serverTimestamp();

        db.collection('recipes').add(recipeData)
            .then(docRef => {
                console.log("✅ Recipe added to Firestore with ID:", docRef.id);
                toggleRecipeForm();
                showSuccessMessage("✅ Recipe saved successfully to your account!");
                loadRecipesFromFirestore(); // Reload recipes from Firestore
                currentTags = []; // Clear tags for the form
            })
            .catch(error => {
                console.error("❌ Error adding recipe to Firestore:", error.message || error);
                alert("Error saving recipe: " + error.message);
            });
    } else { // User is NOT LOGGED IN - Save to Local IndexedDB
        if (!localDB) {
            alert("Local storage is not available. Please sign in to save recipes.");
            console.error("Attempted to save locally, but localDB is not initialized.");
            return;
        }
        console.log("User not logged in, saving recipe to LocalDB:", recipeData);
        recipeData.localId = generateLocalUUID(); // Generate a unique local ID
        recipeData.timestamp = recipeData.timestamp.toISOString(); // Store date as ISO string

        localDB.recipes.add(recipeData)
            .then(() => {
                console.log("✅ Recipe added to LocalDB with localId:", recipeData.localId);
                toggleRecipeForm();
                showSuccessMessage("✅ Recipe saved locally! Sign in to save to the cloud.");
                loadRecipesFromLocal(); // Reload recipes from LocalDB
                currentTags = []; // Clear tags for the form
            })
            .catch(error => {
                console.error("❌ Error adding recipe to LocalDB:", error.stack || error);
                alert("Error saving recipe locally: " + error.message);
            });
    }
}

async function loadRecipesFromLocal() {
    if (!localDB) {
        console.warn("LocalDB not initialized, cannot load local recipes.");
        recipes = []; // Clear recipes array
        displayRecipes(recipes, 'recipeResults'); // Update UI
        return;
    }
    try {
        const localRecipes = await localDB.recipes.orderBy('timestamp').reverse().toArray();
        recipes = localRecipes.map(r => ({ ...r, id: r.localId })); // Use localId as id for consistency in displayRecipes
        console.log("Loaded recipes from LocalDB:", recipes);
        showRecipeFilter(); // This function usually calls displayRecipes
    } catch (error) {
        console.error("❌ Error loading recipes from LocalDB:", error.stack || error);
        recipes = [];
        showRecipeFilter(); // Display empty state
    }
}

// New main function to decide where to load recipes from
function loadInitialRecipes() {
    if (currentUser) {
        console.log("User is logged in, loading recipes from Firestore.");
        loadRecipesFromFirestore(); // Your existing function
    } else {
        console.log("User is not logged in, loading recipes from LocalDB.");
        loadRecipesFromLocal();
    }
}

function showSuccessMessage(message) {
  const view = document.getElementById('mainView');
  
  const successAlert = document.createElement('div');
  successAlert.className = 'alert alert-success text-center position-fixed top-0 start-50 translate-middle-x mt-3';
  successAlert.style.zIndex = 1000;
  successAlert.style.width = '90%';
  successAlert.style.maxWidth = '400px';
  successAlert.textContent = message;

  document.body.appendChild(successAlert);

  setTimeout(() => {
    successAlert.remove();
  }, 3000); // disappear after 3 seconds
}



// --- Updated toggleRecipeForm Function ---
/**
 * Toggles the main recipe form visibility and resets it if opening for a new manual entry.
 * @param {boolean} [forceOpen=false] - If true, ensures the form is opened. If false, it toggles.
 * @param {boolean} [isManualEntrySetup=false] - If true (and opening), sets up for blank manual entry.
 */
function toggleRecipeForm(forceOpen = false, isManualEntrySetup = false) {
    const form = document.getElementById('recipeForm');
    const recipeNameInput = document.getElementById('recipeNameInput');
    const ingredientsTable = document.getElementById('ingredientsTable');
    const instructionsInput = document.getElementById('recipeInstructionsInput');
    const tagInput = document.getElementById('tagInput');
    const photoPreviewContainer = document.getElementById('photoPreviewContainer');
    const ocrTextPasteArea = document.getElementById('ocrTextPaste');

    if (!form) {
        console.error("Recipe form with ID 'recipeForm' not found.");
        return;
    }

    const isCurrentlyOpen = form.classList.contains('open');

    if (forceOpen) {
        if (!isCurrentlyOpen) {
            form.classList.add('open');
        }
        // When forcing open (e.g., for 'manual' or to show AI results),
        // reset only if it's specifically for a new manual entry.
        if (isManualEntrySetup) {
            console.log("toggleRecipeForm: Opening and resetting for new manual entry.");
            if (recipeNameInput) recipeNameInput.value = '';
            if (instructionsInput) instructionsInput.value = '';
            if (ingredientsTable) {
                ingredientsTable.innerHTML = '';
                if (typeof createIngredientRow === "function") createIngredientRow();
            }
            currentTags = []; // Reset global/scoped tags for the form
            if (typeof renderTags === "function") renderTags();
            if (tagInput) tagInput.value = '';
            
            if (photoPreviewContainer) photoPreviewContainer.innerHTML = '';
            if (ocrTextPasteArea) {
                ocrTextPasteArea.value = `📛 RECIPE NAME\n====================\n\n🧂 INGREDIENTS\n====================\n\n📝 INSTRUCTIONS\n====================`;
            }
            // Ensure accordion sections for photo/paste are collapsed for a fresh manual entry
            const collapseOCR = document.getElementById('collapseOCR');
            const collapsePaste = document.getElementById('collapsePaste');
            if (collapseOCR) {
                const bsCollapseOCR = bootstrap.Collapse.getInstance(collapseOCR) || new bootstrap.Collapse(collapseOCR, {toggle: false});
                bsCollapseOCR.hide();
            }
            if (collapsePaste) {
                const bsCollapsePaste = bootstrap.Collapse.getInstance(collapsePaste) || new bootstrap.Collapse(collapsePaste, {toggle: false});
                bsCollapsePaste.hide();
            }
            if (recipeNameInput) recipeNameInput.focus();
        }
    } else { // Standard toggle
        form.classList.toggle('open');
        if (form.classList.contains('open') && !isCurrentlyOpen) { // If just toggled to open
            // Reset for new manual entry if toggled open (old behavior)
            console.log("toggleRecipeForm: Toggled open, resetting for new manual entry.");
            if (recipeNameInput) recipeNameInput.value = '';
            if (instructionsInput) instructionsInput.value = '';
            if (ingredientsTable) {
                ingredientsTable.innerHTML = '';
                if (typeof createIngredientRow === "function") createIngredientRow();
            }
            currentTags = [];
            if (typeof renderTags === "function") renderTags();
            if (tagInput) tagInput.value = '';
            if (photoPreviewContainer) photoPreviewContainer.innerHTML = '';
            if (ocrTextPasteArea) {
                 ocrTextPasteArea.value = `📛 RECIPE NAME\n====================\n\n🧂 INGREDIENTS\n====================\n\n📝 INSTRUCTIONS\n====================`;
            }
            if (recipeNameInput) recipeNameInput.focus();
        }
    }

    if (form.classList.contains('open')) {
        if (typeof initializeMainRecipeFormTagInput === "function") {
            initializeMainRecipeFormTagInput();
        }
        // Scroll the form into view if it's opened
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function getAddRecipeFormHTML() {
    // This MUST return the full HTML string for the content of <div id="recipeForm">...</div>
    // including the manual fields AND the accordion for Photo/Paste.
    // Example:
    return `
        <div class="card card-body">
            <label class="form-label fw-semibold">📛 Recipe Name</label>
            <input class="form-control mb-3" id="recipeNameInput" placeholder="Recipe name" />

            <div class="mb-3">
                <label class="form-label fw-semibold mt-3">🧂 Ingredients</label>
                <div id="ingredientsTable"></div>
                 <button type="button" class="btn btn-outline-secondary btn-sm mt-2" onclick="createIngredientRow('', '', '')"><i class="bi bi-plus-circle"></i> Add Ingredient Row</button>
            </div>

            <label class="form-label fw-semibold mt-3">📝 Instructions</label>
            <textarea class="form-control mb-3" id="recipeInstructionsInput" rows="4" placeholder="Instructions"></textarea>

            <label class="form-label fw-semibold mt-3">🏷️ Tags</label>
            <div class="mb-3">
                <div id="tagsContainer" class="form-control d-flex flex-wrap align-items-center gap-1 p-2 position-relative" style="min-height: 38px; background-color: #f8f9fa; border: 1px dashed #ced4da;">
                    <span id="tagsPlaceholder" class="text-muted position-absolute small" style="left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none;">Add some tags...</span>
                </div>
                <div class="input-group input-group-sm mt-2">
                    <input type="text" id="tagInput" class="form-control" placeholder="Type a tag & press Enter" />
                    <button type="button" id="tagAddButton" class="btn btn-outline-secondary"><i class="bi bi-plus"></i> Add</button>
                </div>
            </div>

            <hr class="my-3" style="border-top: 1px solid #ccc;" />

            <div class="d-flex gap-2 mb-3 justify-content-end">
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick="toggleRecipeForm()">Cancel</button>
                <button type="button" class="btn btn-success btn-sm" onclick="saveRecipe()">Save Recipe</button>
            </div>

            <div class="accordion" id="addRecipeOptionsAccordion">
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingOCR">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOCR" aria-expanded="false" aria-controls="collapseOCR">
                            📸 Add Recipe by Photo
                        </button>
                    </h2>
                    <div id="collapseOCR" class="accordion-collapse collapse" aria-labelledby="headingOCR" data-bs-parent="#addRecipeOptionsAccordion">
                        <div class="accordion-body">
                            <label for="recipePhotoInput" class="form-label">Upload or Take a Recipe Photo</label>
                            <input type="file" id="recipePhotoInput" accept="image/*" capture="environment" class="form-control mb-3" onchange="handleRecipePhoto(event)" />
                            <div id="photoPreviewContainer" class="mb-3"></div>
                        </div>
                    </div>
                </div>
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingPaste">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapsePaste" aria-expanded="false" aria-controls="collapsePaste">
                            ⌨️ Add Recipe by Pasting Text
                        </button>
                    </h2>
                    <div id="collapsePaste" class="accordion-collapse collapse" aria-labelledby="headingPaste" data-bs-parent="#addRecipeOptionsAccordion">
                        <div class="accordion-body">
                            <label for="ocrTextPaste" class="form-label">Paste your recipe text below:</label>
                            <textarea id="ocrTextPaste" class="form-control mb-2" rows="10">
📛 RECIPE NAME
====================

🧂 INGREDIENTS
====================

📝 INSTRUCTIONS
====================
                            </textarea>
                            <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="handlePastedRecipeText()">✨ Parse Text to Fill Form</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
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

function applyAllRecipeFilters() {
    // Use the IDs that are actually in your showRecipeFilter's innerHTML
    const nameSearchInput = document.getElementById('nameSearch'); 
    const ingredientSearchInput = document.getElementById('recipeSearch'); 
    const tagSearchInput = document.getElementById('tagSearch');    

    const nameSearchTerm = nameSearchInput ? nameSearchInput.value.toLowerCase().trim() : "";
    const ingredientSearchValue = ingredientSearchInput ? ingredientSearchInput.value.toLowerCase().trim() : "";
    const ingredientSearchTermsArray = ingredientSearchValue.split(',')
                                         .map(term => term.trim().toLowerCase())
                                         .filter(Boolean);
    const tagSearchValue = tagSearchInput ? tagSearchInput.value.toLowerCase().trim() : "";
    const tagTermsArray = tagSearchValue.split(',')
                            .map(t => t.trim().toLowerCase())
                            .filter(Boolean);

    console.log("Applying filters. Name:", `"${nameSearchTerm}"`, "Ingredients:", ingredientSearchTermsArray, "Tags:", tagTermsArray);
    console.log("Based on master recipes count:", recipes.length);


    let filteredList = [...recipes]; 

    // Filter by Recipe Name
    if (nameSearchTerm) {
        filteredList = filteredList.filter(recipe =>
            recipe.name && recipe.name.toLowerCase().includes(nameSearchTerm)
        );
    }

    // Filter by Ingredients
    if (ingredientSearchTermsArray.length > 0) {
        filteredList = filteredList.filter(recipe => {
            if (!recipe.ingredients || recipe.ingredients.length === 0) return false;
            const ingredientNamesLower = recipe.ingredients.map(ing => {
                const name = (typeof ing === 'object' && ing.name) ? ing.name : (typeof ing === 'string' ? ing : '');
                return name.toLowerCase();
            });
            return ingredientSearchTermsArray.every(term =>
                ingredientNamesLower.some(ingName => ingName.includes(term))
            );
        });
    }

    // Filter by Tags
    if (tagTermsArray.length > 0) {
        filteredList = filteredList.filter(recipe => {
            if (!recipe.tags || recipe.tags.length === 0) return false;
            const recipeTagsLower = recipe.tags.map(tag => tag.toLowerCase());
            return tagTermsArray.every(term =>
                recipeTagsLower.some(tag => tag.includes(term))
            );
        });
    }
    
    const displayOptions = {};
    if (nameSearchTerm) {
        displayOptions.highlightNameTerm = nameSearchTerm;
    }
    if (ingredientSearchTermsArray.length > 0) {
        displayOptions.highlightIngredients = ingredientSearchTermsArray;
    }
    if (tagTermsArray.length > 0) {
        displayOptions.highlightTags = tagTermsArray;
    }

    console.log("Final filtered list count:", filteredList.length);
    displayRecipes(filteredList, 'recipeResults', displayOptions);
}

function filterRecipesByText() { // This will now be triggered by ingredient search input
    applyAllRecipeFilters();
}



// script.js

// Helper function to escape special regex characters and create a highlighting regex
function createHighlightRegex(term) {
    if (!term) return null;
    // Escape special characters in the search term for regex safety
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(${escapedTerm})`, 'gi'); // 'g' for global, 'i' for case-insensitive
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
async function saveNewRecipeToStorage(recipeDataObject) {
    console.log("saveNewRecipeToStorage called with:", recipeDataObject);
    let success = false;

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

        // --- Title Row ---
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

        // --- Button Group (Share, Edit, Chef Bot, Delete) ---
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'd-flex gap-2 align-items-center mt-2 mt-sm-0 recipe-card-actions flex-shrink-0';

        const shareBtn = document.createElement('button');
        shareBtn.className = 'btn btn-outline-secondary btn-sm btn-share';
        if (!currentUser) { /* ... shareBtn logic ... */
            shareBtn.disabled = true;
            shareBtn.title = 'Sign in to share recipes via a link';
            shareBtn.innerHTML = '<i class="bi bi-share"></i>';
            shareBtn.onclick = (e) => { e.preventDefault(); showLoginModal(); };
        } else { /* ... */ 
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

        // ** NEW: Chef Bot Button for This Specific Recipe **
        const chefBotRecipeBtn = document.createElement('button');
        chefBotRecipeBtn.className = 'btn btn-outline-warning btn-sm ask-chef-bot-recipe';
        chefBotRecipeBtn.innerHTML = '<i class="bi bi-robot"></i>';
        chefBotRecipeBtn.title = `Ask Chef Bot about "${recipe.name}"`;
        chefBotRecipeBtn.dataset.recipeId = recipe.id;
        chefBotRecipeBtn.onclick = () => {
            openRecipeSpecificChatModal(recipe); 
        };
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
        // --- End Button Group ---

        titleRow.appendChild(buttonGroup);
        body.appendChild(titleRow);

        // === RESTORED/ENSURED SECTIONS BELOW ===

        // --- Tags and Ratings Row ---
        const tagsAndRatingRow = document.createElement('div');
        tagsAndRatingRow.className = 'd-flex flex-wrap justify-content-between align-items-center mb-2 gap-2';
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'recipe-tags';
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
        tagsAndRatingRow.appendChild(tagsDiv);
        
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
        tagsAndRatingRow.appendChild(ratingContainer);
        body.appendChild(tagsAndRatingRow);

        // --- Ingredients Table ---
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

        // --- Instructions ---
        const instructionsTitle = document.createElement('h6');
        instructionsTitle.className = 'mt-3 mb-1 fw-semibold';
        instructionsTitle.textContent = 'Instructions';
        body.appendChild(instructionsTitle);
        const instructionsP = document.createElement('p');
        instructionsP.className = 'card-text recipe-instructions';
        instructionsP.style.whiteSpace = 'pre-wrap';
        instructionsP.textContent = recipe.instructions || 'No instructions provided.';
        body.appendChild(instructionsP);

        // --- Bottom Button Row (Mark as Made, Plan Meal) ---
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

        // === END RESTORED SECTIONS ===

        card.appendChild(body);
        container.appendChild(card);
    });
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
        // ... (Construct recipePayload using nameInput, instructionsInput, ingredientsTbody, currentEditingTags)
        // ... (Your existing save logic for Firestore or LocalDB)
        // Ensure you are using the live input elements: nameInput, instructionsInput, ingredientsTbody
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
                if (inputs.length >= 3) { // Ensure all inputs are present
                    const ingName = inputs[0].value.trim();
                    const ingQty = inputs[1].value.trim();
                    const ingUnit = inputs[2].value.trim();
                    if (ingName) { 
                        updatedIngredients.push({ name: ingName, quantity: ingQty, unit: ingUnit });
                    }
                }
            });
        }
        
        const recipePayload = {
            name: updatedName,
            ingredients: updatedIngredients,
            instructions: instructionsInput.value.trim(),
            tags: [...currentEditingTags],
            rating: recipeData.rating || 0, 
        };

        try {
            if (currentUser && !isLocalRecipe) {
                recipePayload.uid = recipeData.uid || currentUser.uid;
                recipePayload.timestamp = firebase.firestore.FieldValue.serverTimestamp();
                const docIdToUpdate = recipeData.firestoreId || recipeData.id;
                console.log("Saving updated recipe to Firestore, ID:", docIdToUpdate);
                await db.collection('recipes').doc(docIdToUpdate).set(recipePayload, { merge: true });
                showSuccessMessage("Recipe updated in your account!");
            } else { 
                 if (!localDB) { alert("Local storage not available to save changes."); return; }
                recipePayload.localId = recipeData.id; 
                recipePayload.timestamp = new Date().toISOString();
                console.log("Saving updated recipe to LocalDB, localId:", recipePayload.localId);
                await localDB.recipes.put(recipePayload);
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

function loadRecipesFromFirestore() {
  if (!currentUser) {
    recipes = [];
    showRecipeFilter();
    return;
  }

  db.collection('recipes')
    .where('uid', '==', currentUser.uid) // 🔥 Only pull user’s own recipes
    .get()
    .then(snapshot => {
      recipes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log("Loaded recipes:", recipes);
      showRecipeFilter();
    })
    .catch(err => {
      console.error("❌ Error loading recipes from Firestore:", err);
    });
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

    view.innerHTML = `
        <div class="planned-meals-header mb-3">
            <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center">
                <h4 class="mb-2 mb-sm-0"><i class="bi bi-calendar-week me-2"></i>Planned Meals</h4>
                
                <div class="btn-toolbar" role="toolbar" aria-label="Planned meals actions">
                    <div class="btn-group btn-group-sm w-100" role="group">
                        <button class="btn btn-outline-info" style="flex-basis: 50%;" type="button" data-bs-toggle="collapse" data-bs-target="#planningFiltersCollapse" aria-expanded="false" aria-controls="planningFiltersCollapse" title="Toggle filters for planned meals">
                            <i class="bi bi-funnel-fill"></i> Filters
                        </button>
                        <button id="clearAllPlanningBtn" class="btn btn-outline-danger" style="flex-basis: 50%;" onclick="confirmClearAllPlanning(this)" title="Clear all planned meals">
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

        <h5 class="mb-3"><i class="bi bi-calendar-plus"></i> Plan a New Meal</h5>
        <div class="card card-body bg-light-subtle mb-4">
            <div class="row g-3">
                <div class="col-md-6">
                    <label for="planDate" class="form-label fw-semibold">Select Date:</label>
                    <input type="date" class="form-control form-control-sm" id="planDate" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="col-md-6">
                    <label for="planRecipe" class="form-label fw-semibold">Select Recipe:</label>
                    <select id="planRecipe" class="form-select form-select-sm">
                        <option value="">-- Choose a recipe --</option>
                    </select>
                </div>
            </div>
            <div id="planMealError" class="alert alert-danger small p-2 mt-3" style="display:none;"></div>
            <div class="mt-3 text-end">
                <button class="btn btn-success btn-sm" onclick="addPlannedMeal()"><i class="bi bi-plus-circle"></i> Add to Plan</button>
            </div>
        </div>

        <hr class="my-4" />
        
        <div class="shopping-list-header mb-3">
            <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center">
                <h5 class="mb-2 mb-sm-0"><i class="bi bi-cart3"></i> Shopping List</h5>
                <div class="btn-toolbar" role="toolbar" aria-label="Shopping list actions">
                    <div class="btn-group btn-group-sm w-100" role="group">
                        <button class="btn btn-primary" style="flex-basis: 40%;" onclick="generateShoppingList()" title="Generate list from current plans">
                            <i class="bi bi-list-check"></i> Generate
                        </button>
                        <button id="clearCheckedShoppingListBtn" class="btn btn-outline-success" style="flex-basis: 30%; display: none;" onclick="confirmClearCheckedShoppingListItems()" title="Clear checked items from list">
                            <i class="bi bi-check2-square"></i> Checked
                        </button>
                        <button id="clearShoppingListBtn" class="btn btn-outline-danger" style="flex-basis: 30%;" onclick="confirmClearShoppingList()" disabled title="Clear entire shopping list">
                            <i class="bi bi-trash2"></i> Clear All
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div id="shoppingListResults" class="mb-4">
            <div class="list-group-item text-muted text-center">Generate a list from your planned meals.</div>
        </div>
    `;

    if (typeof populateRecipeDropdownForPlanning === "function") {
        populateRecipeDropdownForPlanning();
    } else {
        console.error("populateRecipeDropdownForPlanning function is not defined.");
    }

    if (typeof applyPlanningFilters === "function") {
        applyPlanningFilters(); 
    } else {
        console.error("applyPlanningFilters function is not defined. Falling back to loadPlannedMeals.");
        if (typeof loadPlannedMeals === "function") {
            loadPlannedMeals();
        } else {
            console.error("loadPlannedMeals also not defined.");
            const plannedListDiv = document.getElementById('plannedMealsList');
            if(plannedListDiv) plannedListDiv.innerHTML = '<div class="list-group-item text-danger text-center">Error: Could not load planned meals function.</div>';
        }
    }

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

function populateRecipeDropdownForPlanning() {
    const select = document.getElementById('planRecipe');
    if (!select) return;
    select.innerHTML = '<option value="">-- Choose a recipe --</option>';

    // The global 'recipes' array is already populated by loadInitialRecipes()
    // with either Firestore or LocalDB recipes.
    if (recipes && recipes.length > 0) {
        // Sort recipes by name for the dropdown
        const sortedRecipes = [...recipes].sort((a, b) => a.name.localeCompare(b.name));
        sortedRecipes.forEach(recipe => {
            const option = document.createElement('option');
            // When not logged in, recipe.id is recipe.localId
            // When logged in, recipe.id is Firestore doc ID
            option.value = recipe.id; 
            option.textContent = recipe.name;
            select.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "No recipes available to plan";
        option.disabled = true;
        select.appendChild(option);
    }
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

function renderPlannedMealsList(plannedEntries) {
    const listContainer = document.getElementById('plannedMealsList');
    listContainer.innerHTML = ''; // Clear previous items or loading message

    if (!plannedEntries || plannedEntries.length === 0) {
         listContainer.innerHTML = `<div class="list-group-item text-muted text-center">No meals planned yet. Use the form below to add some!</div>`;
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

    for (const date of sortedDates) {
        const dateHeader = document.createElement('h6');
        dateHeader.className = 'mt-3 mb-2 text-primary fw-bold ps-1'; // Styling for date header
        dateHeader.textContent = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        listContainer.appendChild(dateHeader);

        mealsByDate[date].forEach(entry => {
            const li = document.createElement('div'); // Changed to div for better styling flexibility with list-group-item
            li.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center mb-1 rounded'; // Added mb-1 and rounded

            const info = document.createElement('span');
            info.textContent = entry.recipeName;
            // You could add a link to view the recipe here if recipeLocalId/recipeId is available
            // e.g., if (entry.recipeLocalId || entry.recipeId) { ... }

            const deleteBtnContainer = document.createElement('div'); // Container for delete button
            deleteBtnContainer.className = 'delete-planned-meal-area';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-outline-danger btn-sm py-0 px-1'; // Smaller padding
            deleteBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
            deleteBtn.title = `Remove ${entry.recipeName} from ${date}`;
            deleteBtn.onclick = () => confirmDeletePlannedMeal(entry.id, deleteBtnContainer, li); // entry.id is firestoreId or localId

            deleteBtnContainer.appendChild(deleteBtn);
            li.appendChild(info);
            li.appendChild(deleteBtnContainer);
            listContainer.appendChild(li);
        });
    }
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

auth.onAuthStateChanged(user => {
    const previousUser = currentUser; // Capture previous state
    currentUser = user;
    updateAuthUI(user);
    loadInitialRecipes(); // This will load from Firestore if 'user' is truthy, or local if 'user' is null

    if (user) {
        console.log("User authenticated:", user.uid);

        // Check if this is a login/signup event AFTER an anonymous session with data
        // We can set a flag when local data is saved, or simply check if local stores have data.
        if (!previousUser && user) { // User just logged in (was previously null)
            checkAndPromptForLocalDataMigration(user);
        }

    } else {
        console.log("User is not authenticated. Operating in 'Local Mode'.");
        // loadInitialRecipes() already handles loading local data
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

