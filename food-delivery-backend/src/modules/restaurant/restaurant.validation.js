export const validateRestaurant = (data) => {
  const errors = {};

  if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
    errors.name = "Name is required and must be a string";
  } else if (data.name.length > 100) {
    errors.name = "Name cannot exceed 100 characters";
  }

  if (!Array.isArray(data.cuisines) || data.cuisines.length === 0) {
    errors.cuisines = "Cuisines must be a non-empty array";
  }

  if (!data.city || typeof data.city !== "string" || data.city.trim() === "") {
    errors.city = "City is required and must be a string";
  } else if (data.city.length > 100) {
    errors.city = "City cannot exceed 100 characters";
  }

  if (data.deliveryFee === undefined || typeof data.deliveryFee !== "number" || data.deliveryFee < 0) {
    errors.deliveryFee = "Delivery fee is required and must be a non-negative number";
  }

  if (!data.deliveryTime || typeof data.deliveryTime !== "number" || data.deliveryTime <= 0) {
    errors.deliveryTime = "Delivery time is required and must be a positive number (in minutes)";
  }

  if (data.minOrder === undefined || typeof data.minOrder !== "number" || data.minOrder < 0) {
    errors.minOrder = "Min order is required and must be a non-negative number";
  }

  if (data.description !== undefined && typeof data.description === "string" && data.description.length > 1000) {
    errors.description = "Description cannot exceed 1000 characters";
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateMenuItem = (data) => {
  const errors = {};

  if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
    errors.name = "Name is required and must be a string";
  } else if (data.name.length > 100) {
    errors.name = "Name cannot exceed 100 characters";
  }

  if (data.price === undefined || typeof data.price !== "number" || data.price <= 0) {
    errors.price = "Price is required and must be a positive number";
  }

  if (!data.category || typeof data.category !== "string" || data.category.trim() === "") {
    errors.category = "Category is required and must be a string";
  } else if (data.category.length > 100) {
    errors.category = "Category cannot exceed 100 characters";
  }

  if (data.isVeg !== undefined && typeof data.isVeg !== "boolean") {
    errors.isVeg = "isVeg must be a boolean";
  }

  if (data.description !== undefined && typeof data.description !== "string") {
    errors.description = "Description must be a string";
  } else if (data.description && data.description.length > 500) {
    errors.description = "Description cannot exceed 500 characters";
  }

  if (data.imageUrl !== undefined && typeof data.imageUrl !== "string") {
    errors.imageUrl = "ImageUrl must be a string";
  }

  if (data.isBestseller !== undefined && typeof data.isBestseller !== "boolean") {
    errors.isBestseller = "isBestseller must be a boolean";
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateUpdateRestaurant = (data) => {
  const errors = {};

  if (data.name !== undefined) {
    if (typeof data.name !== "string" || data.name.trim() === "") {
      errors.name = "Name must be a non-empty string";
    } else if (data.name.length > 100) {
      errors.name = "Name cannot exceed 100 characters";
    }
  }

  if (data.cuisines !== undefined) {
    if (!Array.isArray(data.cuisines) || data.cuisines.length === 0) {
      errors.cuisines = "Cuisines must be a non-empty array";
    }
  }

  if (data.city !== undefined) {
    if (typeof data.city !== "string" || data.city.trim() === "") {
      errors.city = "City must be a non-empty string";
    } else if (data.city.length > 100) {
      errors.city = "City cannot exceed 100 characters";
    }
  }

  if (data.deliveryFee !== undefined) {
    if (typeof data.deliveryFee !== "number" || data.deliveryFee < 0) {
      errors.deliveryFee = "Delivery fee must be a non-negative number";
    }
  }

  if (data.deliveryTime !== undefined) {
    if (typeof data.deliveryTime !== "number" || data.deliveryTime <= 0) {
      errors.deliveryTime = "Delivery time must be a positive number";
    }
  }

  if (data.minOrder !== undefined) {
    if (typeof data.minOrder !== "number" || data.minOrder < 0) {
      errors.minOrder = "Min order must be a non-negative number";
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== "string") {
      errors.description = "Description must be a string";
    } else if (data.description.length > 1000) {
      errors.description = "Description cannot exceed 1000 characters";
    }
  }

  if (data.imageUrl !== undefined && typeof data.imageUrl !== "string") {
    errors.imageUrl = "ImageUrl must be a string";
  }

  if (data.deliveryRadius !== undefined && typeof data.deliveryRadius !== "number") {
    errors.deliveryRadius = "DeliveryRadius must be a number";
  }

  return Object.keys(errors).length > 0 ? errors : null;
};
