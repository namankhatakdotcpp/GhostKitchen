'use client';

type Props = {
  name: string;
  price: number;
  onAdd: () => void;
};
  
  export default function MenuItemCard({ name, price, onAdd }: Props) {
    return (
      <div className="flex justify-between items-center border rounded-lg p-3">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-gray-500">₹{price}</p>
        </div>
  
        <button
          onClick={onAdd}
          className="px-3 py-1 rounded bg-emerald-500 text-white text-sm"
        >
          Add
        </button>
      </div>
    );
  }
  