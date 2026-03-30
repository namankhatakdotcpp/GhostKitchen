import {
  getRestaurants,
  getRestaurantById,
  getRestaurantMenu,
  createRestaurant,
  updateRestaurant,
  toggleRestaurantStatus,
  addMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem,
  getMenuItemByIdAndRestaurant,
  getRestaurantByIdAndOwner,
} from "./restaurant.service.js";
import {
  validateRestaurant,
  validateMenuItem,
  validateUpdateRestaurant,
} from "./restaurant.validation.js";

export const listRestaurants = async (req, res) => {
  try {
    const { search, city, isVeg, minRating, page = 1, limit = 12 } = req.query;

    const result = await getRestaurants(search, city, isVeg, minRating, parseInt(page), parseInt(limit));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error listing restaurants:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getRestaurant = async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await getRestaurantById(id);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    return res.status(200).json(restaurant);
  } catch (error) {
    console.error("Error fetching restaurant:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getMenu = async (req, res) => {
  try {
    const { id } = req.params;

    const isOwner = req.user && req.user.role === "SHOPKEEPER";

    const menu = await getRestaurantMenu(id, isOwner);

    if (!menu) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    return res.status(200).json(menu);
  } catch (error) {
    console.error("Error fetching menu:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createNewRestaurant = async (req, res) => {
  try {
    const { name, cuisines, city, deliveryFee, deliveryTime, minOrder, description, imageUrl, deliveryRadius } = req.body;

    const validationError = validateRestaurant({
      name,
      cuisines,
      city,
      deliveryFee,
      deliveryTime,
      minOrder,
    });

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const restaurant = await createRestaurant(
      {
        name,
        cuisines,
        city,
        deliveryFee,
        deliveryTime,
        minOrder,
        description,
        imageUrl,
        deliveryRadius,
      },
      req.user.userId
    );

    return res.status(201).json({ message: "Restaurant created successfully", restaurant });
  } catch (error) {
    console.error("Error creating restaurant:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateExistingRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);

    if (!restaurant) {
      return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const validationError = validateUpdateRestaurant(updateData);

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const updated = await updateRestaurant(id, updateData);

    return res.status(200).json({ message: "Restaurant updated successfully", restaurant: updated });
  } catch (error) {
    console.error("Error updating restaurant:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);

    if (!restaurant) {
      return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const updated = await toggleRestaurantStatus(id);

    return res.status(200).json({ message: "Restaurant status updated", restaurant: updated });
  } catch (error) {
    console.error("Error toggling restaurant status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const addNewMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, description, imageUrl, isVeg, isBestseller } = req.body;

    const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);

    if (!restaurant) {
      return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const validationError = validateMenuItem({ name, price, category, description, imageUrl, isVeg, isBestseller });

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const menuItem = await addMenuItem(id, {
      name,
      price,
      category,
      description,
      imageUrl,
      isVeg,
      isBestseller,
    });

    return res.status(201).json({ message: "Menu item added successfully", menuItem });
  } catch (error) {
    console.error("Error adding menu item:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateExistingMenuItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const updateData = req.body;

    const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);

    if (!restaurant) {
      return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const menuItem = await getMenuItemByIdAndRestaurant(itemId, id);

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const validationError = validateMenuItem(updateData);

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const updated = await updateMenuItem(id, itemId, updateData);

    return res.status(200).json({ message: "Menu item updated successfully", menuItem: updated });
  } catch (error) {
    console.error("Error updating menu item:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const toggleMenuItemStatus = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);

    if (!restaurant) {
      return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const menuItem = await getMenuItemByIdAndRestaurant(itemId, id);

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const updated = await toggleMenuItemAvailability(itemId);

    return res.status(200).json({ message: "Menu item availability toggled", menuItem: updated });
  } catch (error) {
    console.error("Error toggling menu item availability:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteExistingMenuItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);

    if (!restaurant) {
      return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const menuItem = await getMenuItemByIdAndRestaurant(itemId, id);

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    await deleteMenuItem(itemId);

    return res.status(200).json({ message: "Menu item deleted successfully" });
  } catch (error) {
    console.error("Error deleting menu item:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
