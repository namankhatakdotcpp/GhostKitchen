const tabs = ["Home", "Orders", "Profile"];

export default function BottomNav() {
  return (
    <div className="flex justify-around py-3">
      {tabs.map((tab) => (
        <button
          key={tab}
          className="text-sm text-gray-600 font-medium"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
