import { prisma } from "../../config/prisma.js";

export async function getAddonGroupsForItem(menuItemId) {
  return prisma.addonGroup.findMany({
    where: { menuItemId },
    orderBy: { sortOrder: "asc" },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function createAddonGroup(menuItemId, { name, required = false, multiSelect = false, maxSelect = null, sortOrder = 0 }) {
  return prisma.addonGroup.create({
    data: { menuItemId, name, required, multiSelect, maxSelect, sortOrder },
    include: { options: true },
  });
}

export async function updateAddonGroup(groupId, data) {
  return prisma.addonGroup.update({ where: { id: groupId }, data });
}

export async function deleteAddonGroup(groupId) {
  await prisma.addonGroup.delete({ where: { id: groupId } });
}

export async function createAddonOption(addonGroupId, { name, pricePaise = 0, isDefault = false, sortOrder = 0 }) {
  return prisma.addonOption.create({ data: { addonGroupId, name, pricePaise, isDefault, sortOrder } });
}

export async function updateAddonOption(optionId, data) {
  return prisma.addonOption.update({ where: { id: optionId }, data });
}

export async function deleteAddonOption(optionId) {
  await prisma.addonOption.delete({ where: { id: optionId } });
}

export async function verifyGroupBelongsToRestaurant(groupId, restaurantId) {
  const group = await prisma.addonGroup.findUnique({
    where: { id: groupId },
    include: { menuItem: { select: { restaurantId: true } } },
  });
  if (!group || group.menuItem.restaurantId !== restaurantId) throw new Error("Not found");
  return group;
}

export async function verifyOptionBelongsToRestaurant(optionId, restaurantId) {
  const option = await prisma.addonOption.findUnique({
    where: { id: optionId },
    include: { addonGroup: { include: { menuItem: { select: { restaurantId: true } } } } },
  });
  if (!option || option.addonGroup.menuItem.restaurantId !== restaurantId) throw new Error("Not found");
  return option;
}
