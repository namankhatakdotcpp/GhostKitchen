import MenuItemCard from "../components/MenuItemCard";
import { useCartStore } from "../store/cartStore";

type Props = {
  restaurant: { id: string; name: string };
  onBack: () => void;
};

const MENU = [
  { id: "m1", name: "Chicken Biryani", price: 220 },
  { id: "m2", name: "Paneer Biryani", price: 180 },
];

export default function RestaurantMenu({ restaurant, onBack }: Props) {
  const addItem = useCartStore((s) => s.addItem);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-blue-600">
        ← Back
      </button>

      <h2 className="text-lg font-semibold">{restaurant.name}</h2>

      {MENU.map((item) => (
        <MenuItemCard
          key={item.id}
          name={item.name}
          price={item.price}
          onAdd={() =>
            addItem(restaurant.id, {
              id: item.id,
              name: item.name,
              price: item.price,
            })
          }
        />
      ))}
    </div>
  );
}
