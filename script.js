let recipes = [];

async function loadRecipes() {
  const res = await fetch('recipes.json');
  recipes = await res.json();
  showRecipeFilter();
}

function showRecipeFilter() {
    const view = document.getElementById('mainView');
    view.innerHTML = `
      <h5 class="mb-3">📚 Recipes</h5>
      <input type="text" class="form-control mb-3" id="recipeSearch" placeholder="Filter by ingredient..." oninput="filterRecipesByText()" />
      <div id="recipeResults"></div>
    `;
    displayRecipes(recipes, 'recipeResults');
  }
  

function showRandomRecipe() {
  const view = document.getElementById('mainView');
  const randomIndex = Math.floor(Math.random() * recipes.length);
  view.innerHTML = '<h5>🎲 Random Recipe</h5>';
  displayRecipes([recipes[randomIndex]]);
}

function viewHistory() {
  const view = document.getElementById('mainView');
  const history = JSON.parse(localStorage.getItem('history') || '[]');
  view.innerHTML = '<h5>🕘 Recipe History</h5>';

  if (history.length === 0) {
    view.innerHTML += '<p>No history yet.</p>';
    return;
  }

  history.reverse().forEach(entry => {
    const card = document.createElement('div');
    card.className = 'card';

    const body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = `
      <h5 class="card-title">${entry.recipe}</h5>
      <p><strong>Date:</strong> ${new Date(entry.timestamp).toLocaleString()}</p>
      <p><strong>Notes:</strong> ${entry.notes || '(No notes)'}</p>
    `;

    card.appendChild(body);
    view.appendChild(card);
  });
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
    const query = document.getElementById('recipeSearch').value.toLowerCase().trim();
    if (!query) {
      displayRecipes(recipes, 'recipeResults');
      return;
    }
  
    const keywords = query.split(/\s+/);
  
    const filtered = recipes.filter(r => {
      const ingString = r.ingredients.join(' ').toLowerCase();
      return keywords.every(k => ingString.includes(k));
    });
  
    displayRecipes(filtered, 'recipeResults');
  }
  

function displayRecipes(list, containerId = 'mainView') {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = '<p>No matching recipes found.</p>';
    return;
  }
  container.innerHTML = '';
  list.forEach(r => {
    const card = document.createElement('div');
    card.className = 'card';

    const body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = `
      <h5 class="card-title">${r.name}</h5>
      <p><strong>Ingredients:</strong> ${r.ingredients.join(', ')}</p>
      <p><strong>Instructions:</strong> ${r.instructions}</p>
      <button class="btn btn-success btn-sm" onclick="markAsMade('${r.name}')">Mark as Made</button>
    `;
    card.appendChild(body);
    container.appendChild(card);
  });
}

function markAsMade(recipeName) {
  const notes = prompt(`Notes for "${recipeName}"?`);
  const history = JSON.parse(localStorage.getItem('history') || '[]');
  history.push({
    recipe: recipeName,
    timestamp: new Date().toISOString(),
    notes: notes || ''
  });
  localStorage.setItem('history', JSON.stringify(history));
  alert("Saved to history!");
}

loadRecipes();

let ingredientsData = [];

async function showIngredients() {
    const view = document.getElementById('mainView');
    view.innerHTML = `
      <h5 class="mb-3">🧂 Ingredients Repository</h5>
      <input type="text" class="form-control mb-3" id="ingredientSearch" placeholder="Search ingredient..." oninput="filterIngredients()" />
  
      <button class="btn btn-success mb-3" onclick="toggleAddIngredient()">➕ Add Ingredient</button>
      
      <div id="addIngredientForm" class="mb-4" style="display: none;">
        <div class="card card-body">
          <input class="form-control mb-2" id="newIngName" placeholder="Name" />
          <input class="form-control mb-2" id="newIngComponents" placeholder="Components (comma separated)" />
          <input class="form-control mb-2" id="newIngUnit" placeholder="Unit (e.g. oz, lb)" />
          <input class="form-control mb-2" id="newIngCost" placeholder="Cost (e.g. 1.50)" type="number" step="0.01" />
          <input class="form-control mb-2" id="newIngStore" placeholder="Store URL" />
          <button class="btn btn-primary" onclick="addIngredient()">Add</button>
        </div>
      </div>
  
      <div id="ingredientList"></div>
    `;
  
    if (ingredientsData.length === 0) {
      const fromStorage = localStorage.getItem('ingredientsData');
      if (fromStorage) {
        ingredientsData = JSON.parse(fromStorage);
      } else {
        const res = await fetch('ingredients.json');
        ingredientsData = await res.json();
      }
    }
  
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
      <p>🧬 <strong>Made of:</strong> ${item.components.length ? item.components.join(', ') : '—'}</p>
      <p>📏 <strong>Unit:</strong> ${item.unit}</p>
      <p>💲 <strong>Cost:</strong> $${item.cost.toFixed(2)}</p>
      <a href="${item.store}" class="btn btn-sm btn-outline-primary" target="_blank">🛒 View in Store</a>
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
  
    ingredientsData.push(newIngredient);
    localStorage.setItem('ingredientsData', JSON.stringify(ingredientsData));
    renderIngredientList(ingredientsData);
    toggleAddIngredient();
  }
  