type Props = {
    name: string;
    onClick: () => void;
  };
  
  export default function RestaurantCard({ name, onClick }: Props) {
    return (
      <div
        onClick={onClick}
        className="cursor-pointer rounded-xl border bg-white p-4 hover:shadow-md transition"
      >
        <h3 className="font-semibold text-[#1A1A1A]">{name}</h3>
        <p className="text-sm text-gray-500">Tap to view menu</p>
      </div>
    );
  }
  