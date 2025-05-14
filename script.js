let recipes = [];
let madeModalRecipe = '';
let currentTags = [];
let currentUser = null; // Global user tracker
let currentChatbotRecipe = null;
let chatbotModalElement = null; // To keep a reference to the modal DOM element
let loginModalInstance = null; // To store the Bootstrap modal instance
let localDB = null; // Initialize localDB as null

document.addEventListener('DOMContentLoaded', () => {
    const loginModalElement = document.getElementById('loginModal');
    if (loginModalElement) {
        loginModalInstance = new bootstrap.Modal(loginModalElement);
    }
});

function initializeLocalDB() {
    if (!window.indexedDB) {
        console.warn("IndexedDB not supported by this browser. Local storage features will be limited.");
        // You could fall back to localStorage for very basic things or disable local features.
        return;
    }

    localDB = new Dexie("RecipeAppDB");
    localDB.version(1).stores({
        recipes: '++localId, name, timestamp', // ++localId for auto-generated primary key, name & timestamp for potential indexing/sorting
        // We can add more stores later for history, planning, etc.
        // For 'recipes', we'll store the whole recipe object.
        // 'name' and 'timestamp' are examples of indexes.
        // If your recipe objects saved to Firebase have an 'id' (Firebase doc ID),
        // you might want a different key for local: '++id, firebaseId, name, timestamp'
        // For anonymous users, we'll generate a local ID.
    });

    localDB.open().then(() => {
        console.log("RecipeAppDB (IndexedDB via Dexie) opened successfully.");
    }).catch(err => {
        console.error("Failed to open RecipeAppDB:", err.stack || err);
        // Handle error, perhaps disable local storage features
        localDB = null; // Ensure localDB is null if opening failed
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
  const view = document.getElementById('mainView');
  view.className = 'section-recipes';
  view.innerHTML = `
  <h5 class="mb-3">📚 Recipes</h5>

  <input type="text" class="form-control mb-2" id="recipeSearch" placeholder="Filter by ingredient..." oninput="filterRecipesByText()" />
  <input type="text" class="form-control mb-2" id="tagSearch" placeholder="Filter by tag..." oninput="filterRecipesByTag()" />


  <button class="btn btn-outline-primary mb-3" onclick="toggleRecipeForm()">Add Recipe</button>

  <div id="recipeForm" class="collapsible-form mb-4">
    <div class="card card-body">

      <!-- Manual Entry -->
      <label class="form-label fw-semibold">📛 Recipe Name</label>
      <input class="form-control mb-3" id="recipeNameInput" placeholder="Recipe name" />


      <div class="mb-3">
        <label class="form-label fw-semibold mt-3">🧂 Ingredients</label>
        <div id="ingredientsTable"></div>
      </div>

      <label class="form-label fw-semibold mt-3">📝 Instructions</label>
      <textarea class="form-control mb-3" id="recipeInstructionsInput" rows="4" placeholder="Instructions"></textarea>


      <label class="form-label fw-semibold mt-3">🏷️ Tags</label>
      <div class="mb-3">
        <div id="tagsContainer" class="form-control d-flex flex-wrap align-items-center gap-2 p-2 position-relative" style="min-height: 45px; background-color: #f8f9fa; border: 1px dashed #ced4da;">
          <span id="tagsPlaceholder" class="text-muted position-absolute" style="left: 10px; top: 8px; pointer-events: none;">Add some tags...</span>
        </div>
        <div class="d-flex flex-nowrap gap-2 mt-2">
          <input type="text" id="tagInput" class="form-control" placeholder="Type a tag" style="flex: 1; min-width: 0;" />
          <button type="button" id="tagAddButton" class="btn btn-outline-dark btn-sm flex-shrink-0" style="min-width: 90px;">Add Tag</button>
        </div>
      </div>


      <hr class="my-3" style="border-top: 2px solid #ccc;" />

      <div class="d-flex gap-2 mb-4">
        <button class="btn btn-outline-primary" onclick="saveRecipe()">Add Recipe</button>
        <button class="btn btn-outline-dark" onclick="toggleRecipeForm()">Cancel</button>
      </div>

      <!-- ➕ OCR + Paste Cards -->
      <div class="accordion" id="addRecipeOptionsAccordion">

        <!-- 📸 OCR Section -->
        <div class="accordion-item">
          <h2 class="accordion-header" id="headingOCR">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOCR" aria-expanded="false" aria-controls="collapseOCR">
              📸 Add Recipe by Photo
            </button>
          </h2>
          <div id="collapseOCR" class="accordion-collapse collapse" aria-labelledby="headingOCR" data-bs-parent="#addRecipeOptionsAccordion">
            <div class="accordion-body">
              <label for="recipePhotoInput" class="form-label">Upload or Take a Recipe Photo</label>
              <input
                type="file"
                id="recipePhotoInput"
                accept="image/*"
                capture="environment"
                class="form-control mb-3"
                onchange="handleRecipePhoto(event)"
              />
              <div id="photoPreviewContainer" class="mb-3"></div>
            </div>
          </div>
        </div>

        <!-- ⌨️ Paste Text Section -->
        <div class="accordion-item">
          <h2 class="accordion-header" id="headingPaste">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapsePaste" aria-expanded="false" aria-controls="collapsePaste">
              ⌨️ Add Recipe by Pasting Text
            </button>
          </h2>
          <div id="collapsePaste" class="accordion-collapse collapse" aria-labelledby="headingPaste" data-bs-parent="#addRecipeOptionsAccordion">
            <div class="accordion-body">
              <label for="ocrTextPaste" class="form-label">Paste your recipe name, ingredients, and instructions below the dashed lines.</label>
              <textarea id="ocrTextPaste" class="form-control mb-2" rows="10">
📛 RECIPE NAME
====================


🧂 INGREDIENTS
====================


📝 INSTRUCTIONS
====================


</textarea>

              <button class="btn btn-sm btn-outline-primary" onclick="handlePastedRecipeText()">✨ Parse Text to Fill Form</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>


  <div id="recipeResults"></div>
`;

  displayRecipes(recipes, 'recipeResults');

  // Attach event handler to the Add Tag button
const tagInput = document.getElementById('tagInput');
const tagAddButton = document.getElementById('tagAddButton');
if (tagAddButton) {
  tagAddButton.onclick = () => {
    const value = tagInput.value.trim().toLowerCase();
    if (value && !currentTags.includes(value)) {
      currentTags.push(value);
      renderTags();
    }
    tagInput.value = '';
  };
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



async function handleRecipePhoto(event) {
    console.log("--- handleRecipePhoto called at: ", new Date().toISOString(), "Event type:", event.type); // LOG A
    const file = event.target.files[0];
    if (!file) return;

    const photoPreviewContainer = document.getElementById('photoPreviewContainer');
    if (!photoPreviewContainer) {
        console.error("photoPreviewContainer element not found!");
        return;
    }
    photoPreviewContainer.innerHTML = `
        <div class="text-center">
            <p>Preparing image... <span class="spinner-border spinner-border-sm"></span></p>
        </div>`;

    const reader = new FileReader();

    reader.onload = function (e) {
        const originalImgSrc = e.target.result;
        const imgForPreprocessing = document.createElement('img');
        imgForPreprocessing.src = originalImgSrc;

        imgForPreprocessing.onload = async () => { // Ensure image is loaded for its dimensions
            console.log("--- imgForPreprocessing.onload triggered at: ", new Date().toISOString()); // LOG B
            photoPreviewContainer.innerHTML = ''; // Clear "Preparing..."

            // Display original and preprocessed image (optional but good for UX)
            const originalLabel = document.createElement('p');
            originalLabel.className = 'text-center fw-semibold';
            originalLabel.textContent = "📷 Original Photo";
            const originalImgDisplay = document.createElement('img');
            originalImgDisplay.src = originalImgSrc;
            originalImgDisplay.className = 'img-fluid rounded border d-block mx-auto mb-2';
            originalImgDisplay.style.maxHeight = "200px";


            const processedLabel = document.createElement('p');
            processedLabel.className = 'text-center fw-semibold';
            processedLabel.textContent = "🧼 Preprocessed (Sent to AI)";
            const processedDataUrl = preprocessImage(imgForPreprocessing); // Your existing function
            const processedImgDisplay = document.createElement('img');
            processedImgDisplay.src = processedDataUrl;
            processedImgDisplay.className = 'img-fluid rounded border d-block mx-auto mb-3';
            processedImgDisplay.style.maxHeight = "200px";

            const imageRow = document.createElement('div');
            imageRow.className = 'row';
            const col1 = document.createElement('div');
            col1.className = 'col-md-6 text-center';
            col1.appendChild(originalLabel);
            col1.appendChild(originalImgDisplay);
            const col2 = document.createElement('div');
            col2.className = 'col-md-6 text-center';
            col2.appendChild(processedLabel);
            col2.appendChild(processedImgDisplay);
            imageRow.appendChild(col1);
            imageRow.appendChild(col2);
            photoPreviewContainer.appendChild(imageRow);


            const statusMessage = document.createElement('p');
            statusMessage.className = 'text-center mt-3 alert alert-info';
            statusMessage.innerHTML = '🤖 Sending to AI for recipe extraction... <span class="spinner-border spinner-border-sm"></span>';
            photoPreviewContainer.appendChild(statusMessage);

            try {
                const base64ImageData = processedDataUrl.split(',')[1]; // Get only the base64 part

                const response = await fetch("/.netlify/functions/process-recipe-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        image: base64ImageData,
                        mimeType: file.type // e.g., "image/jpeg", "image/png"
                    })
                });

                statusMessage.remove(); // Remove "Sending to AI..."

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `Server error ${response.status}. Please check Netlify function logs.` }));
                    throw new Error(errorData.error || `Failed to process image: ${response.statusText}`);
                }

                const recipeData = await response.json();

                if (recipeData.error) { // Handle errors returned in the JSON body from the function
                    throw new Error(recipeData.error);
                }

                // Display success and fill form
                const successMsg = document.createElement('p');
                successMsg.className = 'alert alert-success mt-2 text-center';
                successMsg.textContent = '✅ AI successfully extracted recipe data!';
                photoPreviewContainer.appendChild(successMsg);

                const fillFormBtn = document.createElement('button');
                fillFormBtn.className = 'btn btn-primary mt-2 mb-3 d-block mx-auto';
                fillFormBtn.innerHTML = '✨ Fill Recipe Form with this Data';
                fillFormBtn.onclick = () => {
                    // Ensure the main recipe form is visible
                    const recipeFormDiv = document.getElementById('recipeForm');
                    if (recipeFormDiv && !recipeFormDiv.classList.contains('open')) {
                        toggleRecipeForm(); // Open the form if it's not already
                    }
                    fillRecipeForm(recipeData); // Your existing function to fill the form fields
                    document.getElementById('recipeNameInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
                    successMsg.textContent = '✅ Form filled! Please review and save.';
                    fillFormBtn.remove(); // Remove button after clicking
                };
                photoPreviewContainer.appendChild(fillFormBtn);

                console.log("AI Extracted Recipe Data:", recipeData);

            } catch (err) {
                console.error("Error processing recipe photo with AI:", err);
                if(statusMessage && statusMessage.parentNode) statusMessage.remove(); // remove if still there
                const errorDisplay = document.createElement('p');
                errorDisplay.className = 'alert alert-danger mt-2 text-center';
                errorDisplay.textContent = `❌ AI Processing Error: ${err.message}`;
                photoPreviewContainer.appendChild(errorDisplay);
            }
        };

        // Handle cases where the image might already be loaded (e.g., from cache or very small image)
        if (imgForPreprocessing.complete && imgForPreprocessing.naturalWidth !== 0) {
            imgForPreprocessing.onload();
        }
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


function markAsMade(recipeName, buttonElement) {
  console.log("✅ Mark as Made clicked for:", recipeName);

  const card = buttonElement.closest('.card');
  if (!card) return;

  // Prevent multiple open forms
  if (card.querySelector('.mark-made-form')) return;

  const form = document.createElement('div');
  form.className = 'mark-made-form mt-3 p-2 border rounded bg-light';

  const textarea = document.createElement('textarea');
  textarea.className = 'form-control mb-2';
  textarea.rows = 2;
  textarea.placeholder = 'Optional comment...';

  // 💾 Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-outline-dark btn-sm';
  saveBtn.innerHTML = '💾 Save';

  // ❌ Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-outline-danger btn-sm';
  cancelBtn.innerHTML = '❌ Cancel';

  // 📅 Made Date label
  const dateLabel = document.createElement('label');
  dateLabel.textContent = 'Made date:';
  dateLabel.className = 'form-label mb-0 ms-3 fw-semibold';
  dateLabel.style.whiteSpace = 'nowrap';

  // 🗓️ Date picker
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'form-control form-control-sm';
  dateInput.style.maxWidth = '150px';

  // Default to today
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;

  // ➕ Controls container
  const controls = document.createElement('div');
  controls.className = 'd-flex align-items-center gap-2 flex-wrap';

  controls.appendChild(saveBtn);
  controls.appendChild(cancelBtn);
  controls.appendChild(dateLabel);
  controls.appendChild(dateInput);

  // 💾 Save logic
  saveBtn.onclick = () => {
    const notes = textarea.value.trim();
    const timestamp = new Date(dateInput.value).toISOString();
  
    // 🔥 Find the full recipe object
    const recipeObj = recipes.find(r => r.name === recipeName);
  
    db.collection("history").add({
      recipe: recipeName,
      tags: recipeObj?.tags || [], // ✅ Save tags too!
      timestamp: timestamp,
      notes: notes || '',
      uid: currentUser.uid
    }).then(() => {
      console.log("✅ History entry added!");
      form.innerHTML = '<div class="text-success fw-bold">✅ Marked as made!</div>';
      setTimeout(() => form.remove(), 2000);
    }).catch(err => {
      console.error("❌ Failed to save history:", err);
      alert('Failed to save history.');
    });
  };
  

  // ❌ Cancel logic
  cancelBtn.onclick = () => form.remove();

  form.appendChild(textarea);
  form.appendChild(controls);
  card.appendChild(form);
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



function preprocessImage(img) {
  const canvas = document.getElementById('preprocessCanvas');
  const ctx = canvas.getContext('2d');

  const scaleFactor = 2;
  const width = img.naturalWidth * scaleFactor;
  const height = img.naturalHeight * scaleFactor;

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Parameters to tweak
  const brightness = 1.1; // Lighten slightly
  const contrast = 1.1;   // Gentle boost

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];

    // Convert to grayscale
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // Apply brightness and contrast adjustment
    gray = ((gray - 128) * contrast + 128) * brightness;

    // Clamp to 0–255 range
    gray = Math.max(0, Math.min(255, gray));

    // Apply grayscale to all color channels
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
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



function toggleRecipeForm() {
  const form = document.getElementById('recipeForm');
  if (!form) return;

  const isNowOpen = form.classList.toggle('open');

  const nameInput = document.getElementById('recipeNameInput');
  const ingredientsTable = document.getElementById('ingredientsTable');
  const instructionsInput = document.getElementById('recipeInstructionsInput');

  if (isNowOpen) {
    // ✅ When opening, clear old values and set up grid
    if (nameInput) nameInput.value = '';
    if (instructionsInput) instructionsInput.value = '';
    if (ingredientsTable) {
      ingredientsTable.innerHTML = '';
      createIngredientRow();
    }

    const tagInput = document.getElementById('tagInput');
    const tagsContainer = document.getElementById('tagsContainer');

    if (tagInput && tagsContainer) {
      tagInput.value = '';
      tagsContainer.innerHTML = '';

      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const value = tagInput.value.trim().toLowerCase();
          if (value && !currentTags.includes(value)) {
            currentTags.push(value);
            renderTags();
          }
          tagInput.value = '';
        }
      });
    }

    const preview = document.getElementById('photoPreviewContainer');
    if (preview) preview.innerHTML = '';
  } else {
    // Optional cleanup when hiding
    if (ingredientsTable) ingredientsTable.innerHTML = '';
  }
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


function viewHistory() {
  const view = document.getElementById('mainView');
  view.className = 'section-history';
  view.innerHTML = `
    <h5 class="mb-3">🕘 Recipe History</h5>

    <input type="text" class="form-control mb-2" id="historySearch" placeholder="Search notes or recipe name..." oninput="filterHistory()" />
    <input type="text" class="form-control mb-3" id="historyTagSearch" placeholder="Filter by tag..." oninput="filterHistory()" />

    <div id="historyList">Loading...</div>
  `;


  db.collection("history")
  .where('uid', '==', currentUser.uid)
  .orderBy('timestamp', 'desc')
  .get().then(snapshot => {
    const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderHistoryList(history);
  }).catch(err => {
    console.error("Error loading history:", err);
    document.getElementById('historyList').innerHTML = '<p>Error loading history</p>';
  });
}


function renderHistoryList(entries, highlightTags = []) {
  const container = document.getElementById('historyList');
  container.innerHTML = '';

  if (entries.length === 0) {
    container.innerHTML = '<p>No history found.</p>';
    return;
  }

  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'card mb-3 shadow-sm';

    const body = document.createElement('div');
    body.className = 'card-body d-flex justify-content-between align-items-start';

    const textArea = document.createElement('div');

    const tagHtml = (entry.tags && entry.tags.length > 0)
      ? `
        <div class="mb-2">
          <strong>Tags:</strong><br />
          ${entry.tags.map(tag => {
            const lowerTag = tag.toLowerCase();
            const isHighlighted = highlightTags.includes(lowerTag);
            const badgeClass = isHighlighted
              ? 'badge bg-warning text-dark me-1 mt-1'
              : 'badge bg-primary text-white me-1 mt-1';
            return `<span class="${badgeClass}">${tag}</span>`;
          }).join('')}
        </div>
      `
      : '';

    textArea.innerHTML = `
      <h5 class="card-title">${entry.recipe}</h5>
      <p><strong>Date:</strong> ${new Date(entry.timestamp).toLocaleDateString()}</p>
      ${tagHtml}
      <p><strong>Notes:</strong> ${entry.notes || '(No notes)'}</p>
    `;

    const deleteArea = document.createElement('div');
    deleteArea.className = 'delete-area';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline-danger btn-sm flex-shrink-0';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete entry';
    deleteBtn.onclick = () => confirmDeleteHistory(entry.id, deleteArea, card);

    deleteArea.appendChild(deleteBtn);

    body.appendChild(textArea);
    body.appendChild(deleteArea);
    card.appendChild(body);
    container.appendChild(card);
  });
}




function filterHistory() {
  const query = document.getElementById('historySearch').value.toLowerCase();
  const tagSearch = document.getElementById('historyTagSearch').value.toLowerCase();
  const tagTerms = tagSearch.split(',').map(t => t.trim()).filter(Boolean);

  db.collection("history")
    .where("uid", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .get()
    .then(snapshot => {
      const allEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const filtered = allEntries.filter(entry => {
        const matchesText = !query || (
          entry.recipe.toLowerCase().includes(query) ||
          (entry.notes && entry.notes.toLowerCase().includes(query))
        );

        const entryTags = (entry.tags || []).map(t => t.toLowerCase());
        const matchesTags = tagTerms.length === 0 || tagTerms.every(term =>
          entryTags.some(tag => tag.startsWith(term))
        );

        return matchesText && matchesTags;
      });

      renderHistoryList(filtered, tagTerms);
    });
}


function confirmDeleteHistory(entryId, deleteArea, cardElement) {
  if (deleteArea.querySelector('.confirm-delete')) return;

  deleteArea.innerHTML = '';

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-delete d-flex align-items-center gap-2';

  // Styled confirm text
  const confirmText = document.createElement('span');
  confirmText.className = 'fw-semibold text-danger';
  confirmText.textContent = 'Confirm?';

  // ✅ Confirm button
  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-success';
  yesBtn.innerHTML = '✅';
  yesBtn.title = 'Confirm delete';
  yesBtn.onclick = () => {
    db.collection('history').doc(entryId).delete()
      .then(() => {
        console.log('✅ History entry deleted:', entryId);
        cardElement.remove();
      })
      .catch((err) => {
        console.error('❌ Failed to delete history entry:', err);
        alert('Failed to delete entry.');
        deleteArea.innerHTML = '';
      });
  };

  // ❌ Cancel button
  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-danger';
  noBtn.innerHTML = '❌';
  noBtn.title = 'Cancel';
  noBtn.onclick = () => {
    deleteArea.innerHTML = '';
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-outline-danger btn-sm flex-shrink-0';
    restoreBtn.innerHTML = '🗑️';
    restoreBtn.title = 'Delete entry';
    restoreBtn.onclick = () => confirmDeleteHistory(entryId, deleteArea, cardElement);
    deleteArea.appendChild(restoreBtn);
  };

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);
  deleteArea.appendChild(confirmArea);
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

function filterRecipesByText() {
  const search = document.getElementById('recipeSearch').value.trim().toLowerCase();
  const searchTerms = search.split(',').map(s => s.trim()).filter(Boolean);

  if (searchTerms.length === 0) {
    displayRecipes(recipes);
    return;
  }

  const filtered = recipes.filter(recipe => {
    if (!recipe.ingredients) return false;

    const ingredientNames = recipe.ingredients.map(ing => 
      typeof ing === 'object' ? ing.name.toLowerCase() : ing.toLowerCase()
    );

    // ✅ ALL search terms must match at least once
    return searchTerms.every(term =>
      ingredientNames.some(ingName => ingName.includes(term))
    );
  });

  displayRecipes(filtered, 'recipeResults', { highlightIngredients: searchTerms });
}



function displayRecipes(list, containerId = 'recipeResults', options = {}) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const highlightIngredients = options.highlightIngredients || [];
  const highlightTags = options.highlightTags || [];

  if (list.length === 0) {
    container.innerHTML = '<p class="text-muted">No matching recipes found.</p>';
    return;
  }

  list.forEach(r => {
    const card = document.createElement('div');
    card.className = 'card mb-3 shadow-sm';

    const body = document.createElement('div');
    body.className = 'card-body';

    const titleRow = document.createElement('div');
    titleRow.className = 'd-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2';


    const title = document.createElement('span');
    title.className = 'badge bg-warning text-dark fs-5 py-2 px-3 mb-0';
    title.style.minWidth = '150px';
    title.textContent = r.name;

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn btn-outline-secondary btn-sm btn-share';
    shareBtn.innerHTML = '🔗';
    shareBtn.title = 'Share recipe';
    shareBtn.onclick = () => shareRecipe(r.id);
    card.dataset.recipeId = r.id;

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-outline-primary btn-sm';
    editBtn.innerHTML = '✏️';
    editBtn.onclick = () => openInlineEditor(r.id, card);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline-danger btn-sm';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.onclick = () => confirmDeleteRecipe(r.id, deleteBtn);

    // ✅ Wrap delete button in .delete-area with relative positioning
    const deleteArea = document.createElement('div');
    deleteArea.className = 'delete-area position-relative d-inline-block';
    deleteArea.appendChild(deleteBtn);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'd-flex gap-2 align-items-center';
    buttonGroup.prepend(shareBtn);
    buttonGroup.appendChild(editBtn);
    buttonGroup.appendChild(deleteArea);

    titleRow.appendChild(title);
    titleRow.appendChild(buttonGroup);

    body.appendChild(titleRow);

    // ➤ Tags and Ratings row
    const tagsAndRatingRow = document.createElement('div');
    tagsAndRatingRow.className = 'd-flex justify-content-between align-items-center mb-2';

    const ratingContainer = document.createElement('div');
    ratingContainer.className = 'rating-stars d-flex gap-1';

    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('i');
      star.className = i <= (r.rating || 0) ? 'bi bi-star-fill text-warning' : 'bi bi-star text-warning';
      star.style.cursor = 'pointer';
      star.dataset.value = i;
      star.addEventListener('mouseenter', () => highlightStars(ratingContainer, i));
      star.addEventListener('mouseleave', () => resetStars(ratingContainer, r.rating || 0));
      star.addEventListener('click', () => updateRecipeRating(r.id, i));
      ratingContainer.appendChild(star);
    }

    const tagsRow = document.createElement('div');
    if (r.tags && r.tags.length > 0) {
      r.tags.forEach(tag => {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'badge me-1';
        if (highlightTags.some(term => tag.toLowerCase().includes(term))) {
          tagBadge.classList.add('bg-warning', 'text-dark');
        } else {
          tagBadge.classList.add('bg-primary', 'text-white');
        }
        tagBadge.textContent = tag;
        tagsRow.appendChild(tagBadge);
      });
    }

    tagsAndRatingRow.appendChild(tagsRow);
    tagsAndRatingRow.appendChild(ratingContainer);
    body.appendChild(tagsAndRatingRow);

    // ➤ Ingredients table
    const table = document.createElement('table');
    table.className = 'table table-bordered table-sm mb-2';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Ingredient</th>
        <th>Qty</th>
        <th>Unit</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (Array.isArray(r.ingredients)) {
      r.ingredients.forEach(i => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');

        const ingName = typeof i === 'object' ? i.name : i;

        if (highlightIngredients.some(term => ingName.toLowerCase().includes(term))) {
          nameTd.innerHTML = `<span class="bg-warning">${ingName}</span>`;
        } else {
          nameTd.textContent = ingName;
        }

        const qtyTd = document.createElement('td');
        qtyTd.textContent = i.quantity || '';

        const unitTd = document.createElement('td');
        unitTd.textContent = i.unit || '';

        tr.appendChild(nameTd);
        tr.appendChild(qtyTd);
        tr.appendChild(unitTd);
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    body.appendChild(table);

    // ➤ Instructions
    const instructions = document.createElement('p');
    instructions.innerHTML = `<strong>Instructions:</strong> ${r.instructions}`;
    body.appendChild(instructions);

    // ➤ Buttons row: Mark as Made + Plan Meal
    const buttonRow = document.createElement('div');
    buttonRow.className = 'd-flex align-items-center gap-2 mt-3';

    const madeBtn = document.createElement('button');
    madeBtn.className = 'btn btn-outline-info btn-sm';
    madeBtn.textContent = 'Mark as Made';
    madeBtn.onclick = (e) => markAsMade(r.name, e.target);

    const planArea = document.createElement('div');
    planArea.className = 'plan-area';

    const planBtn = document.createElement('button');
    planBtn.className = 'btn btn-outline-success btn-sm';
    planBtn.textContent = 'Plan Meal';
    planBtn.onclick = () => openPlanMealForm(r, planArea);

    planArea.appendChild(planBtn);

    buttonRow.appendChild(madeBtn);
    buttonRow.appendChild(planArea);

    body.appendChild(buttonRow);

    card.appendChild(body);
    container.appendChild(card);
  });
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
  if (container.querySelector('input[type="date"]')) return;

  container.innerHTML = ''; // clear the Plan Meal button

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'form-control form-control-sm';
  dateInput.style.maxWidth = '150px'; // keep it compact inline

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-outline-dark btn-sm';
  saveBtn.textContent = '💾';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-outline-danger btn-sm';
  cancelBtn.textContent = '❌';

  // Inline flex for form
  const form = document.createElement('div');
  form.className = 'd-flex align-items-center gap-2';
  form.appendChild(dateInput);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);

  container.appendChild(form);

  saveBtn.onclick = () => {
    const selectedDate = dateInput.value;
    if (!selectedDate) {
      dateInput.classList.add('is-invalid');
      return;
    }

    db.collection("planning").add({
      date: selectedDate,
      recipeId: recipe.id,
      recipeName: recipe.name,
      uid: currentUser.uid // ✅ REQUIRED BY SECURITY RULES
    }).then(() => {
      console.log("✅ Meal planned:", recipe.name, "on", selectedDate);
      container.innerHTML = '<span class="text-success fw-bold">✅ Planned!</span>';
      setTimeout(() => {
        container.innerHTML = '';
        const planBtn = document.createElement('button');
        planBtn.className = 'btn btn-outline-primary btn-sm';
        planBtn.textContent = 'Plan Meal';
        planBtn.onclick = () => openPlanMealForm(recipe, container);
        container.appendChild(planBtn);
      }, 2000);
    }).catch(err => {
      console.error("❌ Failed to plan meal:", err);
      container.innerHTML = '<span class="text-danger fw-bold">❌ Failed</span>';
      setTimeout(() => {
        container.innerHTML = '';
        const planBtn = document.createElement('button');
        planBtn.className = 'btn btn-outline-primary btn-sm';
        planBtn.textContent = 'Plan Meal';
        planBtn.onclick = () => openPlanMealForm(recipe, container);
        container.appendChild(planBtn);
      }, 2000);
    });
  };

  cancelBtn.onclick = () => {
    container.innerHTML = '';
    const planBtn = document.createElement('button');
    planBtn.className = 'btn btn-outline-primary btn-sm';
    planBtn.textContent = 'Plan Meal';
    planBtn.onclick = () => openPlanMealForm(recipe, container);
    container.appendChild(planBtn);
  };
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


async function openInlineEditor(id, card) {
  try {
    const doc = await db.collection('recipes').doc(id).get();
    if (!doc.exists) {
      alert("Recipe not found.");
      return;
    }

    const data = doc.data();
    const ingredients = data.ingredients || [];
    let editingTags = [...(data.tags || [])];

    card.innerHTML = '';
    const body = document.createElement('div');
    body.className = 'card-body';

    // 📛 Recipe Name
    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-label fw-semibold';
    nameLabel.textContent = '📛 Recipe Name';
    body.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.className = 'form-control mb-3';
    nameInput.value = data.name || '';
    body.appendChild(nameInput);

    // 🧂 Ingredients
    const ingLabel = document.createElement('label');
    ingLabel.className = 'form-label fw-semibold';
    ingLabel.textContent = '🧂 Ingredients';
    body.appendChild(ingLabel);

    const ingredientsGrid = document.createElement('div');
    ingredientsGrid.className = 'mb-2';
    ingredientsGrid.innerHTML = `
      <table class="table table-sm table-bordered mb-2">
        <thead>
          <tr><th>Ingredient</th><th>Qty</th><th>Unit</th><th></th></tr>
        </thead>
        <tbody id="editIngredientsTable-${id}"></tbody>
      </table>
    `;
    body.appendChild(ingredientsGrid);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-outline-primary btn-sm mb-3';
    addBtn.textContent = 'Add Ingredient';
    addBtn.onclick = () => addIngredientRow(id);
    body.appendChild(addBtn);

const breakLine = document.createElement('div');
breakLine.className = 'w-100';
body.appendChild(breakLine);

const instrLabel = document.createElement('label');
instrLabel.className = 'form-label fw-semibold mt-3';
instrLabel.textContent = '📝 Instructions';
body.appendChild(instrLabel);

const instructionsInput = document.createElement('textarea');
instructionsInput.className = 'form-control mb-3';
instructionsInput.rows = 4;
instructionsInput.value = data.instructions || '';
body.appendChild(instructionsInput);


    // 🏷️ Tags
    const tagsLabel = document.createElement('label');
    tagsLabel.className = 'form-label fw-semibold';
    tagsLabel.textContent = '🏷️ Tags';
    body.appendChild(tagsLabel);

    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'mb-3';
    tagsWrapper.innerHTML = `
      <div id="inlineTagsContainer-${id}" class="form-control d-flex flex-wrap align-items-center gap-2 p-2 position-relative" style="min-height: 45px; background-color: #f8f9fa; border: 1px dashed #ced4da;">
        <span id="inlineTagsPlaceholder-${id}" class="text-muted position-absolute" style="left: 10px; top: 8px; pointer-events: none;">Add some tags...</span>
      </div>
      <div class="d-flex flex-nowrap mt-2 gap-2">
        <input type="text" id="inlineTagInput-${id}" class="form-control" placeholder="Type a tag" />
        <button type="button" id="inlineAddTagBtn-${id}" class="btn btn-outline-dark btn-sm w-25">Add Tag</button>
      </div>
    `;
    body.appendChild(tagsWrapper);

    const tagDivider = document.createElement('hr');
    tagDivider.className = 'my-3'; // adds vertical spacing (mt-3 + mb-3)
    tagDivider.style.borderTop = '2px solid #ccc'; // soft gray line
    body.appendChild(tagDivider);


    // Save / Cancel buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'd-flex gap-2 mt-3';
    btnRow.innerHTML = `
      <button class="btn btn-outline-primary btn-sm">Save</button>
      <button class="btn btn-outline-dark btn-sm">Cancel</button>
    `;
    body.appendChild(btnRow);

    card.appendChild(body);

    // Populate ingredient table
    const tbody = document.getElementById(`editIngredientsTable-${id}`);
    ingredients.forEach(i => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input class="form-control form-control-sm" value="${i.name || ''}" placeholder="Ingredient"></td>
        <td><input class="form-control form-control-sm" value="${i.quantity || ''}" placeholder="Qty"></td>
        <td><input class="form-control form-control-sm" value="${i.unit || ''}" placeholder="Unit"></td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-danger" title="Delete ingredient">🗑️</button>
        </td>
      `;
      row.querySelector('button').onclick = () => row.remove();
      tbody.appendChild(row);
    });

    addIngredientRow(id); // always have a blank row

    // Tags logic
    const tagInput = document.getElementById(`inlineTagInput-${id}`);
    const tagsContainer = document.getElementById(`inlineTagsContainer-${id}`);
    const placeholder = document.getElementById(`inlineTagsPlaceholder-${id}`);

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = tagInput.value.trim().toLowerCase();
        if (value && !editingTags.includes(value)) {
          editingTags.push(value);
          renderInlineTags();
        }
        tagInput.value = '';
      }
    });

    const tagAddButton = document.getElementById('tagAddButton');
    tagAddButton.onclick = () => {
      const value = tagInput.value.trim().toLowerCase();
      if (value && !currentTags.includes(value)) {
        currentTags.push(value);
        renderTags();
      }
      tagInput.value = '';
    };


    function renderInlineTags() {
      tagsContainer.innerHTML = '';

      if (editingTags.length === 0) {
        placeholder.style.display = 'block';
      } else {
        placeholder.style.display = 'none';
      }

      editingTags.forEach(tag => {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'badge bg-primary text-white me-1';
        tagBadge.textContent = tag;
        tagBadge.onclick = () => {
          editingTags = editingTags.filter(t => t !== tag);
          renderInlineTags();
        };
        tagsContainer.appendChild(tagBadge);
      });
    }

    renderInlineTags();

    // Save button
    btnRow.querySelector('.btn-outline-primary').onclick = async () => {
      const updatedName = nameInput.value.trim();
      const updatedInstructions = instructionsInput.value.trim();
      const updatedIngredients = [];

      const rows = document.querySelectorAll(`#editIngredientsTable-${id} tr`);
      rows.forEach(row => {
        const cells = row.querySelectorAll('input');
        const name = cells[0].value.trim();
        const quantity = cells[1].value.trim();
        const unit = cells[2].value.trim();
        if (name) {
          updatedIngredients.push({ name, quantity, unit });
        }
      });

      try {
        await db.collection('recipes').doc(id).update({
          name: updatedName,
          ingredients: updatedIngredients,
          instructions: updatedInstructions,
          tags: editingTags,
        });
        console.log("✅ Recipe updated:", updatedName);
        loadRecipesFromFirestore(); // refresh view
      } catch (err) {
        console.error("Error updating recipe:", err);
        alert("Failed to save changes.");
      }
    };

    // Cancel button
    btnRow.querySelector('.btn-outline-dark').onclick = () => {
      loadRecipesFromFirestore(); // reload and exit
    };

    // Add blank ingredient row
    function addIngredientRow(editId) {
      const tbody = document.getElementById(`editIngredientsTable-${editId}`);
      const newRow = document.createElement('tr');
      newRow.innerHTML = `
        <td><input class="form-control form-control-sm" placeholder="Ingredient"></td>
        <td><input class="form-control form-control-sm" placeholder="Qty"></td>
        <td><input class="form-control form-control-sm" placeholder="Unit"></td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-danger" title="Delete ingredient">🗑️</button>
        </td>
      `;
      newRow.querySelector('button').onclick = () => newRow.remove();
      tbody.appendChild(newRow);
    }

  } catch (err) {
    console.error("Error opening inline editor:", err);
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

function confirmDeleteRecipe(id, buttonElement) {
    const container = buttonElement.closest('.delete-area');

    if (!container || container.querySelector('.confirm-delete')) return;

    // Hide the original delete button
    buttonElement.style.display = 'none';

    // Inline confirm bar
    const confirmBar = document.createElement('div');
    confirmBar.className = 'confirm-delete d-inline-flex align-items-center gap-2';

    const text = document.createElement('span');
    text.className = 'text-danger fw-semibold';
    text.textContent = 'Confirm?';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-sm btn-outline-success';
    confirmBtn.innerHTML = '✅';

    confirmBtn.onclick = () => {
        console.log("Delete confirmation clicked. ID:", id, "currentUser:", currentUser);

        // Restore button and remove confirm bar regardless of outcome,
        // or do it specifically in .then() and .catch()
        const cleanupUI = () => {
            if (confirmBar.parentNode) { // Check if confirmBar is still in DOM
                confirmBar.remove();
            }
            buttonElement.style.display = ''; // Restore original icon
        };

        if (currentUser) {
            // --- User is LOGGED IN: Delete from Firestore ---
            console.log("Attempting to delete Firestore recipe ID:", id, "by user UID:", currentUser.uid);
            db.collection("recipes").doc(id).delete()
                .then(() => {
                    console.log("Recipe successfully deleted from Firestore.");
                    showSuccessMessage("Recipe deleted from your account.");
                    loadInitialRecipes(); // This will call loadRecipesFromFirestore()
                    cleanupUI();
                })
                .catch(err => {
                    console.error("❌ Error deleting recipe from Firestore:", err);
                    alert("Failed to delete recipe: " + err.message);
                    cleanupUI(); // Restore UI on failure
                });
        } else {
            // --- User is NOT LOGGED IN: Delete from LocalDB ---
            console.log("Attempting to delete local recipe with localId:", id);
            if (!localDB) {
                console.error("LocalDB not initialized. Cannot delete local recipe.");
                alert("Local storage not available.");
                cleanupUI();
                return;
            }

            // 'id' here is the localId because loadRecipesFromLocal maps localId to id
            localDB.recipes.delete(id)
                .then(() => {
                    console.log("Recipe deleted from LocalDB:", id);
                    showSuccessMessage("Recipe deleted locally.");
                    loadInitialRecipes(); // This will call loadRecipesFromLocal()
                    cleanupUI();
                })
                .catch(err => {
                    console.error("❌ Error deleting recipe from LocalDB:", err.stack || err);
                    alert("Failed to delete local recipe: " + err.message);
                    cleanupUI(); // Restore UI on failure
                });
        }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-outline-danger';
    cancelBtn.innerHTML = '❌';
    cancelBtn.onclick = () => {
        if (confirmBar.parentNode) {
            confirmBar.remove();
        }
        buttonElement.style.display = ''; // Restore original icon
    };

    confirmBar.appendChild(text);
    confirmBar.appendChild(confirmBtn);
    confirmBar.appendChild(cancelBtn);

    container.appendChild(confirmBar);
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
  const view = document.getElementById('mainView');
  view.className = 'section-planning';
  view.innerHTML = `
    <h5 class="mb-3">📋 Planned Meals</h5>

    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">Planned Meals</h6>
      <button id="clearPlanningBtn" class="btn btn-outline-danger btn-sm" onclick="clearAllPlanning(this)">🧹 Clear Planned Meals</button>
    </div>

    <div id="plannedMealsList" class="mb-4"></div>

    <hr />

    <h5 class="mb-3">🛒 Shopping List</h5>

    <div class="d-flex justify-content-between align-items-center mb-2">
      <button class="btn btn-outline-success" onclick="generateShoppingList()">🛒 Generate Ingredient Checklist</button>
      <button id="clearShoppingListBtn" class="btn btn-outline-danger btn-sm" onclick="clearShoppingList()" disabled>🗑️ Clear Shopping List</button>
    </div>

    <div id="shoppingListResults" class="mb-4"></div>

    <hr />

    <h5 class="mb-3">Plan a New Meal</h5>

    <div class="mb-3">
      <label class="form-label">📅 Select Date:</label>
      <input type="date" class="form-control" id="planDate" />
    </div>

    <div class="mb-3">
      <label class="form-label">🍽️ Select Recipe:</label>
      <select id="planRecipe" class="form-select">
        <option value="">-- Choose --</option>
      </select>
    </div>

    <button class="btn btn-outline-success btn-sm">
      <span class="text-success"></span> Add to Plan
    </button>

  `;

  populateRecipeDropdown();
  loadPlannedMeals();
  loadShoppingList();
}

function populateRecipeDropdown() {
  const select = document.getElementById('planRecipe');
  select.innerHTML = '<option value="">-- Choose --</option>';
  recipes.forEach(recipe => {
    const option = document.createElement('option');
    option.value = recipe.id;
    option.textContent = recipe.name;
    select.appendChild(option);
  });
}

function addPlannedMeal() {
  const date = document.getElementById('planDate').value;
  const recipeId = document.getElementById('planRecipe').value;

  if (!date || !recipeId) {
    alert("Please select a date and a recipe!");
    return;
  }

  // ✅ Find the recipe object
  const recipe = recipes.find(r => r.id === recipeId);

  if (!recipe) {
    alert("Recipe not found!");
    return;
  }

  db.collection("planning").add({
    date,
    recipeId,
    recipeName: recipe.name,
    uid: currentUser.uid // 🔥 save the user id
  }).then(() => {
    console.log("✅ Meal added to planning:", recipe.name);
    loadPlannedMeals();
  }).catch(err => {
    console.error("❌ Error adding to planning:", err);
  });
}


function loadPlannedMeals() {
  const list = document.getElementById('plannedMealsList');
  list.innerHTML = 'Loading...';

  db.collection("planning")
  .where('uid', '==', currentUser.uid)
  .orderBy('date')
  .get().then(snapshot => {
    if (snapshot.empty) {
      list.innerHTML = '<p class="text-muted">No planned meals yet.</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'list-group';

    snapshot.forEach(doc => {
      const data = doc.data();
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';

      const info = document.createElement('div');
      info.innerHTML = `<strong>${data.date}:</strong> ${data.recipeName}`;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-outline-danger btn-sm';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.onclick = () => deletePlannedMeal(doc.id, deleteBtn);

      li.appendChild(info);
      li.appendChild(deleteBtn);
      ul.appendChild(li);
    });

    list.innerHTML = '';
    list.appendChild(ul);
  }).catch(err => {
    console.error("Error loading planning:", err);
  });
}

function generateShoppingList() {
  const output = document.getElementById('shoppingListResults');
  output.innerHTML = 'Generating...';

  db.collection("planning")
  .where('uid', '==', currentUser.uid)
  .get()
  .then(snapshot => {
    if (snapshot.empty) {
      output.innerHTML = '<p class="text-muted">No planned meals found.</p>';
      return;
    }

    const recipeIds = snapshot.docs.map(doc => doc.data().recipeId);
    const ingredientMap = {};

    recipeIds.forEach(id => {
      const recipe = recipes.find(r => r.id === id);
      if (!recipe || !recipe.ingredients) return;

      recipe.ingredients.forEach(ing => {
        const key = `${ing.name}|${ing.unit}`.toLowerCase();
        const qty = parseFloat(ing.quantity) || 0;

        if (!ingredientMap[key]) {
          ingredientMap[key] = { ...ing, quantity: qty };
        } else {
          ingredientMap[key].quantity += qty;
        }
      });
    });

    // Prepare ingredients list
    const ingredients = Object.values(ingredientMap).map(ing => ({
      name: ing.name,
      unit: ing.unit,
      quantity: ing.quantity,
      checked: false // start unchecked
    }));

    renderShoppingList(ingredients);

    // Save it to Firestore!
    db.collection("shopping").doc(currentUser.uid).set({
      ingredients,
      uid: currentUser.uid
      })
      .then(() => console.log("✅ Shopping list saved to cloud"))
      .catch(err => console.error("❌ Failed to save shopping list:", err));
  });
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
  const output = document.getElementById('shoppingListResults');
  output.innerHTML = '';

  const list = document.createElement('ul');
  list.className = 'list-group';

  ingredients.forEach((ing, idx) => {
    const item = document.createElement('li');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    item.dataset.index = idx;

    const leftSide = document.createElement('div');
    leftSide.className = 'd-flex align-items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input';
    checkbox.checked = ing.checked;

    const label = document.createElement('span');
    label.textContent = `${ing.quantity} ${ing.unit} ${ing.name}`;

    if (checkbox.checked) {
      label.style.textDecoration = 'line-through';
      label.style.opacity = '0.6';
    }

    leftSide.appendChild(checkbox);
    leftSide.appendChild(label);

    // 🗑️ Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline-danger btn-sm';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.onclick = () => {
      ingredients.splice(idx, 1); // Remove from local array
      db.collection("shopping").doc(currentUser.uid).set({
        ingredients,
        uid: currentUser.uid // ✅ Required by your Firestore rules
      })
        .then(() => {
          renderShoppingList(ingredients); // Re-render
        })
        .catch(err => {
          console.error("❌ Failed to update shopping list:", err);
        });
    };

    item.appendChild(leftSide);
    item.appendChild(deleteBtn);
    list.appendChild(item);

    // 📦 Click anywhere in left side toggles checkbox
    item.addEventListener('click', (e) => {
      if (e.target === deleteBtn || e.target === checkbox) return; // Ignore clicking delete/checkbox

      checkbox.checked = !checkbox.checked;
      if (checkbox.checked) {
        label.style.textDecoration = 'line-through';
        label.style.opacity = '0.6';
      } else {
        label.style.textDecoration = 'none';
        label.style.opacity = '1';
      }

      ingredients[idx].checked = checkbox.checked;
      db.collection("shopping").doc(currentUser.uid).set({
        ingredients,
        uid: currentUser.uid
      });
    });

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        label.style.textDecoration = 'line-through';
        label.style.opacity = '0.6';
      } else {
        label.style.textDecoration = 'none';
        label.style.opacity = '1';
      }

      ingredients[idx].checked = checkbox.checked;
      db.collection("shopping").doc(currentUser.uid).set({
        ingredients,
        uid: currentUser.uid
      });
    });
  });

  output.appendChild(list);

  const clearBtn = document.getElementById('clearShoppingListBtn');
  if (clearBtn) clearBtn.disabled = ingredients.length === 0;
}



function loadShoppingList() {
  const uid = currentUser.uid;
  const docRef = db.collection("shopping").doc(uid);

  docRef.get().then(doc => {
    const clearBtn = document.getElementById('clearShoppingListBtn');

    if (doc.exists) {
      const data = doc.data();
      if (data.ingredients && data.ingredients.length > 0) {
        renderShoppingList(data.ingredients);
        if (clearBtn) clearBtn.disabled = false;
      } else {
        document.getElementById('shoppingListResults').innerHTML = '<p class="text-muted">No shopping list generated.</p>';
        if (clearBtn) clearBtn.disabled = true;
      }
    } else {
      // 🆕 Create an empty shopping list document scoped to user
      docRef.set({
        ingredients: [],
        uid: uid
      }).then(() => {
        console.log("✅ Initialized empty shopping list for", uid);
        document.getElementById('shoppingListResults').innerHTML = '<p class="text-muted">No shopping list generated.</p>';
        if (clearBtn) clearBtn.disabled = true;
      }).catch(err => {
        console.error("❌ Failed to initialize shopping list:", err);
      });
    }
  }).catch(err => {
    console.error("❌ Failed to load shopping list:", err);
  });
}

function clearShoppingList() {
  console.log("🛠️ clearShoppingList() clicked");
  
  const clearBtn = document.getElementById('clearShoppingListBtn');
  if (!clearBtn) {
    console.log("❌ clearShoppingListBtn not found");
    return;
  }

  // Prevent multiple confirms
  if (clearBtn.parentElement.querySelector('.confirm-clear-shopping')) {
    console.log("❌ Already confirming");
    return;
  }

  clearBtn.style.display = 'none'; // Hide original button

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-clear-shopping d-flex gap-2 align-items-center';

  const confirmText = document.createElement('span');
  confirmText.textContent = 'Clear entire shopping list?';

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

  // Confirm YES
  yesBtn.onclick = () => {
    db.collection("shopping").doc(currentUser.uid).delete().then(() => {
      document.getElementById('shoppingListResults').innerHTML = '<p class="text-muted">No shopping list generated.</p>';
      console.log("✅ Shopping list cleared.");

      // Clean up confirm box
      confirmArea.remove();
      clearBtn.disabled = true; // Disable after clearing
      clearBtn.style.display = 'block';
    }).catch(err => {
      console.error("❌ Failed to clear shopping list:", err);
    });
  };

  // Cancel NO
  noBtn.onclick = () => {
    confirmArea.remove();
    clearBtn.style.display = 'block'; // Restore the original button
  };
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

const auth = firebase.auth();

// Utility to get initials
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  const first = parts[0]?.charAt(0).toUpperCase() || '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
  return first + last;
}

// Update auth UI
function updateAuthUI(user) {
    const authArea = document.getElementById('userAuthArea');
    authArea.innerHTML = '';

    if (user) {
        const wrapper = document.createElement('div');
        wrapper.className = 'position-relative';

        const avatarBtn = document.createElement('button');
        // ... (avatarBtn setup remains the same as before) ...
        avatarBtn.className = 'btn btn-outline-dark rounded-circle fw-bold d-flex align-items-center justify-content-center';
        avatarBtn.style.width = '45px';
        avatarBtn.style.height = '45px';
        avatarBtn.style.fontSize = '1rem';
        avatarBtn.style.padding = '0';
        avatarBtn.title = user.displayName || user.email || 'Account';
        avatarBtn.textContent = getInitials(user.displayName || user.email);
        avatarBtn.setAttribute('aria-expanded', 'false');


        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'user-info-dropdown shadow rounded'; // Using Bootstrap's `rounded` and `shadow`
        dropdownMenu.style.display = 'none';
        dropdownMenu.style.position = 'absolute';
        dropdownMenu.style.top = '55px'; 
        dropdownMenu.style.right = '0';
        dropdownMenu.style.width = '280px'; // Slightly narrower or adjust as you like
        dropdownMenu.style.backgroundColor = 'white';
        // Removed border: '1px solid #ddd'; as shadow and padding will define edges
        dropdownMenu.style.zIndex = '1050';
        dropdownMenu.style.padding = '0.5rem 0'; // Add padding top/bottom for the whole menu

        // -- Dropdown Header: "Signed in as" (Optional, can be removed for more sleekness if email is prominent) --
        const dropdownHeader = document.createElement('div');
        dropdownHeader.className = 'px-3 pt-2 pb-1 text-muted small'; // Adjusted padding
        dropdownHeader.textContent = 'Signed in as:';
        dropdownMenu.appendChild(dropdownHeader);

        // -- User Info Area (Icon + Email) --
        const userInfoDiv = document.createElement('div');
        userInfoDiv.className = 'px-3 pb-2 pt-1 d-flex align-items-center'; // Adjusted padding

        let providerIconHtml = '<i class="bi bi-person-circle me-2 fs-4 text-secondary"></i>'; // Default, larger icon
        if (user.providerData && user.providerData.length > 0) {
            const mainProviderId = user.providerData[0].providerId;
            if (mainProviderId === 'google.com') {
                providerIconHtml = '<i class="bi bi-google me-2 fs-4" style="color: #DB4437;"></i>';
            } else if (mainProviderId === 'password') {
                providerIconHtml = '<i class="bi bi-envelope-fill me-2 fs-4" style="color: #0d6efd;"></i>'; // Bootstrap primary
            } else if (mainProviderId === 'apple.com') {
                providerIconHtml = '<i class="bi bi-apple me-2 fs-4" style="color: #000;"></i>';
            } else if (mainProviderId === 'microsoft.com') {
                providerIconHtml = '<i class="bi bi-microsoft me-2 fs-4" style="color: #0078D4;"></i>';
            }
        }
        const iconWrapper = document.createElement('span'); // Wrapper for icon styling if needed
        iconWrapper.innerHTML = providerIconHtml;
        userInfoDiv.appendChild(iconWrapper);

        const userEmailSpan = document.createElement('span');
        userEmailSpan.className = 'text-truncate fw-medium'; // Changed to fw-medium for slightly less boldness
        userEmailSpan.style.fontSize = '0.95rem';
        userEmailSpan.textContent = user.email || 'No email provided';
        userInfoDiv.appendChild(userEmailSpan);
        dropdownMenu.appendChild(userInfoDiv);

        // -- Subtle Divider (Optional - can use margin/padding instead) --
        // If you want a very subtle divider that doesn't go all the way across:
        const dividerDiv = document.createElement('div');
        dividerDiv.style.height = '1px';
        dividerDiv.style.backgroundColor = '#e9ecef'; // Bootstrap's $gray-200
        dividerDiv.style.margin = '0.5rem 1rem'; // Margin on left/right to not span full width
        dropdownMenu.appendChild(dividerDiv);
        // OR, for no visible line, just rely on padding of the logout item.
        // If you remove the dividerDiv, adjust padding on logoutMenuItem below.

        // -- Log Out Button Area (as a menu item) --
        const logoutMenuItem = document.createElement('a'); // Changed to <a> for semantic menu item
        logoutMenuItem.href = '#'; // Prevent page jump
        logoutMenuItem.className = 'dropdown-item d-flex align-items-center px-3 py-2'; // Bootstrap's dropdown-item class for styling
        logoutMenuItem.style.color = '#dc3545'; // Bootstrap's text-danger color

        logoutMenuItem.innerHTML = '<i class="bi bi-box-arrow-right me-2 fs-5"></i> Log out';
        
        logoutMenuItem.onclick = (e) => {
            e.preventDefault(); // Prevent default anchor action
            signOut(); 
            dropdownMenu.style.display = 'none';
        };
        dropdownMenu.appendChild(logoutMenuItem);

        // Toggle dropdown display
        avatarBtn.onclick = (e) => {
            e.stopPropagation();
            const isShown = dropdownMenu.style.display === 'block';
            dropdownMenu.style.display = isShown ? 'none' : 'block';
            avatarBtn.setAttribute('aria-expanded', String(!isShown));
        };

        wrapper.appendChild(avatarBtn);
        wrapper.appendChild(dropdownMenu);
        authArea.appendChild(wrapper);

        // Global click listener (same as before, ensure it's managed if this function is called often)
        document.addEventListener('click', function closeDropdownOnClickOutside(event) {
            if (dropdownMenu && !wrapper.contains(event.target) && dropdownMenu.style.display === 'block') {
                dropdownMenu.style.display = 'none';
                if(avatarBtn) avatarBtn.setAttribute('aria-expanded', 'false');
            }
        }, { capture: true }); // Use capture phase for this type of global listener to avoid issues with e.stopPropagation()

    } else {
        // ... (Sign In button code remains the same) ...
        const signInBtn = document.createElement('button');
        signInBtn.className = 'btn btn-outline-dark d-flex align-items-center gap-2';
        signInBtn.innerHTML = `<i class="bi bi-person"></i> Sign in`;
        signInBtn.onclick = showLoginModal; 
        authArea.appendChild(signInBtn);
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
auth.onAuthStateChanged(user => {
    currentUser = user;
    updateAuthUI(user); // This will update the Sign In/Out button etc.

    // Always try to load recipes after auth state changes.
    // loadInitialRecipes will decide whether to fetch from Firebase or LocalDB.
    loadInitialRecipes();

    if (user) {
        // Handle pending shared/chatbot recipes if that logic exists
        const pendingShared = localStorage.getItem('pendingSharedRecipe');
        if (pendingShared) {
            const recipe = JSON.parse(pendingShared);
            localStorage.removeItem('pendingSharedRecipe');
            saveSharedRecipe(recipe);
            showSuccessMessage("✅ Shared recipe saved!");
        }
        const pendingChatbot = localStorage.getItem('pendingChatbotRecipe');
        if (pendingChatbot) {
            currentChatbotRecipe = JSON.parse(pendingChatbot);
            localStorage.removeItem('pendingChatbotRecipe');
            saveCurrentChatbotRecipe();
        }
    } else {
        // User is logged out or was never logged in.
        // recipes array is already cleared and reloaded by loadInitialRecipes -> loadRecipesFromLocal
        // If you had other user-specific cleanup, do it here.
    }
});

// Global click listener to close user dropdown
document.addEventListener('click', function (event) {
  const dropdown = document.querySelector('.user-dropdown');
  if (dropdown && dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
  }
});

function showSharedOverlay(recipe) {
  const overlay = document.createElement('div');
  overlay.className = 'position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex justify-content-center align-items-start overflow-auto';
  overlay.style.zIndex = 2000;
  overlay.style.padding = '2rem';

  const card = document.createElement('div');
  card.className = 'card shadow-lg p-4 position-relative';
  card.style.maxWidth = '600px';
  card.style.width = '95%';
  card.style.margin = 'auto';

  card.innerHTML = `
    <!-- Close button in top-right -->
    <button type="button" class="btn-close position-absolute top-0 end-0 m-2" aria-label="Close"></button>

    <h4 class="mb-3">${recipe.name}</h4>

    <div class="mb-2">
      ${(recipe.tags || []).map(tag => `<span class="badge bg-primary me-1">${tag}</span>`).join('')}
    </div>

    <table class="table table-sm table-bordered">
      <thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th></tr></thead>
      <tbody>
        ${(recipe.ingredients || []).map(i => `
          <tr><td>${i.name}</td><td>${i.quantity}</td><td>${i.unit}</td></tr>
        `).join('')}
      </tbody>
    </table>

    <p><strong>Instructions:</strong> ${recipe.instructions}</p>

    <div class="d-flex justify-content-end gap-2 mt-3">
      <button id="saveSharedBtn" class="btn btn-outline-success">Save to My Recipes</button>
      <button class="btn btn-outline-dark">Close</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Handle close via outside click
  overlay.addEventListener('click', (e) => {
    if (!card.contains(e.target)) overlay.remove();
  });

  // Close via top-right "X" button
  const closeBtn = card.querySelector('.btn-close');
  if (closeBtn) closeBtn.onclick = () => overlay.remove();

  // Close via footer button
  const footerCloseBtn = card.querySelector('.btn-outline-dark');
  if (footerCloseBtn) footerCloseBtn.onclick = () => overlay.remove();

  // Save button logic
  const saveBtn = document.getElementById('saveSharedBtn');

  // Update button text based on login state
  if (!currentUser) {
    saveBtn.textContent = 'Sign up and Save to My Recipes';
  }

  saveBtn.onclick = () => {
    if (!currentUser) {
      localStorage.setItem('pendingSharedRecipe', JSON.stringify(recipe));
      showSignInPermissionsPrompt();
      return;
    }

    saveSharedRecipe(recipe);
    overlay.remove();
  };
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
    // Remove existing modal if any to prevent duplicates
    if (chatbotModalElement && chatbotModalElement.parentNode) {
        chatbotModalElement.remove();
    }
    currentChatbotRecipe = null; // Reset any previously generated recipe

    chatbotModalElement = document.createElement('div');
    chatbotModalElement.className = 'position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex justify-content-center align-items-start overflow-auto';
    chatbotModalElement.style.zIndex = 2000; // Ensure it's on top
    chatbotModalElement.style.padding = '2rem';

    const card = document.createElement('div');
    card.className = 'card shadow-lg p-4 position-relative';
    card.style.maxWidth = '700px'; // Wider for input and recipe
    card.style.width = '95%';
    card.style.margin = 'auto';

    card.innerHTML = `
        <button type="button" class="btn-close position-absolute top-0 end-0 m-3" aria-label="Close"></button>
        <h4 class="mb-3"><i class="bi bi-robot"></i> Chef Bot - AI Recipe Assistant</h4>
        
        <div class="mb-3">
            <label for="chatbotQueryInput" class="form-label">Describe the recipe you'd like Chef Bot to create:</label>
            <textarea class="form-control" id="chatbotQueryInput" rows="3" placeholder="e.g., 'a spicy vegetarian curry with chickpeas and spinach for two people'"></textarea>
        </div>
        <button id="askChefBotBtn" class="btn btn-primary mb-3">Ask Chef Bot to Generate</button>
        
        <hr/>
        <div id="chatbotRecipeDisplayArea">
            ${generateRecipeDisplayHTML(null)} </div>
        
        <div class="d-flex justify-content-end gap-2 mt-4">
            <button id="saveChatbotRecipeBtn" class="btn btn-outline-success" disabled>Save to My Recipes</button>
            <button id="closeChatbotModalBtn" class="btn btn-outline-dark">Close</button>
        </div>
    `;

    chatbotModalElement.appendChild(card);
    document.body.appendChild(chatbotModalElement);

    // Event Listeners
    const closeButton = card.querySelector('.btn-close');
    const askChefBotBtn = card.querySelector('#askChefBotBtn');
    const saveChatbotRecipeBtn = card.querySelector('#saveChatbotRecipeBtn');
    const closeChatbotModalBtn = card.querySelector('#closeChatbotModalBtn');
    const chatbotQueryInput = card.querySelector('#chatbotQueryInput');
    const chatbotRecipeDisplayArea = card.querySelector('#chatbotRecipeDisplayArea');

    const closeModal = () => {
        if (chatbotModalElement && chatbotModalElement.parentNode) {
            chatbotModalElement.remove();
        }
        chatbotModalElement = null;
        currentChatbotRecipe = null;
    };

    closeButton.onclick = closeModal;
    closeChatbotModalBtn.onclick = closeModal;
    chatbotModalElement.addEventListener('click', (e) => { // Click outside card to close
        if (!card.contains(e.target)) {
            closeModal();
        }
    });

    askChefBotBtn.onclick = async () => {
        const query = chatbotQueryInput.value.trim();
        if (!query) {
            alert("Please describe the recipe you want.");
            return;
        }

        askChefBotBtn.disabled = true;
        askChefBotBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...';
        chatbotRecipeDisplayArea.innerHTML = '<p class="text-muted mt-3">Chef Bot is thinking... <i class="bi bi-cpu"></i></p>';
        saveChatbotRecipeBtn.disabled = true;
        currentChatbotRecipe = null; // Clear previous recipe

        try {
            console.log("--- About to FETCH /process-recipe-image at: ", new Date().toISOString()); // LOG C
            const response = await fetch("/.netlify/functions/generate-recipe-chat", { // This is your Netlify function endpoint
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: query })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                console.error("Chatbot API error response:", errorData);
                throw new Error(errorData.error || `Chef Bot is having trouble right now (Status: ${response.status}).`);
            }

            currentChatbotRecipe = await response.json(); // Expecting JSON from our Netlify function

            if (currentChatbotRecipe && currentChatbotRecipe.name && currentChatbotRecipe.ingredients && currentChatbotRecipe.instructions && currentChatbotRecipe.tags) {
                chatbotRecipeDisplayArea.innerHTML = generateRecipeDisplayHTML(currentChatbotRecipe);
                saveChatbotRecipeBtn.disabled = false;
            } else {
                console.error("Received unexpected recipe structure:", currentChatbotRecipe);
                chatbotRecipeDisplayArea.innerHTML = '<p class="text-danger mt-3">Sorry, Chef Bot couldn\'t generate a well-structured recipe for that. Please try a different request or check the console.</p>';
            }
        } catch (error) {
            console.error("Chatbot fetch error:", error);
            chatbotRecipeDisplayArea.innerHTML = `<p class="text-danger mt-3">An error occurred: ${error.message}. Please try again.</p>`;
        } finally {
            askChefBotBtn.disabled = false;
            askChefBotBtn.innerHTML = 'Ask Chef Bot to Generate';
        }
    };

    saveChatbotRecipeBtn.onclick = () => {
        if (!currentChatbotRecipe) {
            alert("No recipe to save.");
            return;
        }
        if (!currentUser) {
            // If you have a pending recipe mechanism like for shared recipes:
            localStorage.setItem('pendingChatbotRecipe', JSON.stringify(currentChatbotRecipe));
            showSignInPermissionsPrompt(); // Or your preferred sign-in prompt
            // closeModal(); // Optionally close modal after prompting sign-in
            return;
        }
        saveCurrentChatbotRecipe();
    };
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

