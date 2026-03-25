"use client";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { Plus, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getShopMenuData } from "@/lib/opsData";
import { cn } from "@/lib/utils";
import type { ShopMenuEditorItem } from "@/types";

const menuItemSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().min(8, "Description is required"),
  price: z.coerce.number().min(1, "Price must be positive"),
  category: z.string().min(1, "Category is required"),
  isVeg: z.boolean(),
  imageUrl: z.string().min(1, "Image is required"),
  isBestseller: z.boolean(),
});

type MenuFormState = z.infer<typeof menuItemSchema>;

function SortableMenuCard({
  item,
  onToggleAvailability,
}: {
  item: ShopMenuEditorItem;
  onToggleAvailability: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className="rounded-[18px] border border-border bg-white p-4 shadow-[0_12px_24px_rgba(28,28,28,0.04)]"
    >
      <div className="grid grid-cols-[88px_1fr] gap-4">
        <div className="relative h-[88px] overflow-hidden rounded-[14px] border border-border">
          <Image alt={item.name} className="object-cover" fill sizes="88px" src={item.imageUrl} />
        </div>
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">{item.name}</p>
              <p className="mt-1 text-xs text-text-secondary">₹{item.price}</p>
            </div>
            <span
              className={cn(
                "rounded-pill px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                item.isVeg ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
              )}
            >
              {item.isVeg ? "Veg" : "Non-veg"}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">
            {item.description}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">{item.category}</span>
            <button
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-pill border px-3 text-xs font-semibold",
                item.isAvailable
                  ? "border-success bg-success/10 text-success"
                  : "border-border bg-[#FAFAFA] text-text-secondary",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggleAvailability(item.id);
              }}
              type="button"
            >
              {item.isAvailable ? "Available" : "Unavailable"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShopMenuPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<MenuFormState>({
    name: "",
    description: "",
    price: 0,
    category: "",
    isVeg: true,
    imageUrl: "",
    isBestseller: false,
  });
  const [menuItems, setMenuItems] = useState<ShopMenuEditorItem[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const menuQuery = useQuery({
    queryKey: ["shop-menu"],
    queryFn: getShopMenuData,
  });

  useEffect(() => {
    if (menuQuery.data && menuItems.length === 0) {
      setMenuItems(menuQuery.data);
    }
  }, [menuItems.length, menuQuery.data]);

  const groupedItems = useMemo(() => {
    const source = menuItems.length ? menuItems : menuQuery.data ?? [];
    return source.reduce<Record<string, ShopMenuEditorItem[]>>((acc, item) => {
      acc[item.category] = [...(acc[item.category] ?? []), item].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      return acc;
    }, {});
  }, [menuItems, menuQuery.data]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setMenuItems((current) => {
      const items = current.length ? current : menuQuery.data ?? [];
      const activeIndex = items.findIndex((item) => item.id === active.id);
      const overIndex = items.findIndex((item) => item.id === over.id);
      return arrayMove(items, activeIndex, overIndex).map((item, index) => ({
        ...item,
        sortOrder: index + 1,
      }));
    });
  }

  function toggleAvailability(id: string) {
    setMenuItems((current) =>
      (current.length ? current : menuQuery.data ?? []).map((item) =>
        item.id === id ? { ...item, isAvailable: !item.isAvailable } : item,
      ),
    );
  }

  function submitItem() {
    const parsed = menuItemSchema.safeParse(draft);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors(
        Object.fromEntries(
          Object.entries(fieldErrors).map(([key, value]) => [key, value?.[0] ?? "Invalid"]),
        ),
      );
      return;
    }

    setErrors({});
    setMenuItems((current) => [
      {
        id: `menu-${Date.now()}`,
        restaurantId: "ghost-biryani-house",
        sortOrder: current.length + 1,
        isAvailable: true,
        ...parsed.data,
      },
      ...current,
    ]);
    setIsFormOpen(false);
    setPreview("");
    setDraft({
      name: "",
      description: "",
      price: 0,
      category: "",
      isVeg: true,
      imageUrl: "",
      isBestseller: false,
    });
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
              Menu management
            </p>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">Menu</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Reorder items, toggle availability, and launch new dishes quickly.
            </p>
          </div>
          <Button className="rounded-pill" onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>

        {menuQuery.isLoading ? (
          <div className="bone-loader h-[520px] rounded-[22px]" />
        ) : menuQuery.isError ? (
          <div className="rounded-[20px] border border-border bg-white p-8 text-center">
            <p className="text-lg font-bold text-text-primary">Could not load menu</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedItems).map(([category, items]) => (
              <section key={category}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-text-primary">{category}</h2>
                  <p className="text-sm text-text-secondary">{items.length} items</p>
                </div>
                <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd} sensors={sensors}>
                  <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
                    <div className="grid gap-4 md:grid-cols-2">
                      {items.map((item) => (
                        <SortableMenuCard key={item.id} item={item} onToggleAvailability={toggleAvailability} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </section>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isFormOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-white p-4 md:p-8"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <div className="mx-auto max-w-4xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                    New menu item
                  </p>
                  <h2 className="mt-2 text-3xl font-bold text-text-primary">Add item</h2>
                </div>
                <button
                  className="rounded-full border border-border p-2"
                  onClick={() => setIsFormOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  {[
                    { key: "name", label: "Name", type: "text" },
                    { key: "description", label: "Description", type: "textarea" },
                    { key: "price", label: "Price", type: "number" },
                    { key: "category", label: "Category", type: "text" },
                  ].map((field) => (
                    <label className="block" key={field.key}>
                      <span className="mb-2 block text-sm font-semibold text-text-primary">
                        {field.label}
                      </span>
                      {field.type === "textarea" ? (
                        <textarea
                          className="min-h-[120px] w-full rounded-[16px] border border-border px-4 py-3 outline-none focus:border-brand"
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                          value={draft[field.key as keyof MenuFormState] as string}
                        />
                      ) : (
                        <input
                          className="h-12 w-full rounded-[16px] border border-border px-4 outline-none focus:border-brand"
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [field.key]:
                                field.type === "number"
                                  ? Number(event.target.value)
                                  : event.target.value,
                            }))
                          }
                          type={field.type}
                          value={draft[field.key as keyof MenuFormState] as string | number}
                        />
                      )}
                      {errors[field.key] ? (
                        <span className="mt-2 block text-xs font-medium text-danger">
                          {errors[field.key]}
                        </span>
                      ) : null}
                    </label>
                  ))}

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex items-center justify-between rounded-[16px] border border-border px-4 py-3">
                      <span className="text-sm font-semibold text-text-primary">Veg</span>
                      <input
                        checked={draft.isVeg}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, isVeg: event.target.checked }))
                        }
                        type="checkbox"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-[16px] border border-border px-4 py-3">
                      <span className="text-sm font-semibold text-text-primary">Bestseller</span>
                      <input
                        checked={draft.isBestseller}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, isBestseller: event.target.checked }))
                        }
                        type="checkbox"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block rounded-[20px] border border-dashed border-border p-6 text-center">
                    <UploadCloud className="mx-auto h-8 w-8 text-text-muted" />
                    <p className="mt-3 text-sm font-semibold text-text-primary">
                      Drag-drop image or paste URL
                    </p>
                    <input
                      className="mt-4 h-12 w-full rounded-[14px] border border-border px-4 outline-none focus:border-brand"
                      onChange={(event) => {
                        setPreview(event.target.value);
                        setDraft((current) => ({
                          ...current,
                          imageUrl: event.target.value,
                        }));
                      }}
                      placeholder="https://..."
                      value={preview}
                    />
                    {errors.imageUrl ? (
                      <span className="mt-2 block text-xs font-medium text-danger">
                        {errors.imageUrl}
                      </span>
                    ) : null}
                  </label>

                  <div className="overflow-hidden rounded-[20px] border border-border bg-[#FAFAFA] p-4">
                    <p className="text-sm font-semibold text-text-primary">Preview</p>
                    <div className="mt-4 relative h-56 overflow-hidden rounded-[16px] border border-border bg-white">
                      {preview ? (
                        <Image alt="Preview" className="object-cover" fill sizes="320px" src={preview} />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                          Image preview
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  className="rounded-pill border border-border px-5 py-3 text-sm font-semibold text-text-primary"
                  onClick={() => setIsFormOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <Button className="rounded-pill" onClick={submitItem}>
                  Save item
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
