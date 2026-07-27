// Shared by the Рецепты list (Inventory.jsx) and global search — total
// approximate cost of a recipe from ingredient qty x catalog cost-per-unit.
// Returns null (shown as "—") when no ingredient has a cost set, so an
// all-zero total isn't mistaken for "this recipe costs nothing."
export function computeRecipeCost(recipe, recountCatalog) {
  let total = 0
  let hasAny = false
  for (const ing of recipe.ingredients) {
    const product = recountCatalog.find((p) => p.id === Number(ing.productId) || p.id === ing.productId)
    const cost = Number(product?.costPerUnit)
    if (product && cost > 0) {
      total += cost * Number(ing.qty || 0)
      hasAny = true
    }
  }
  return hasAny ? total : null
}
