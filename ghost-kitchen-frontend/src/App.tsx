import Navbar from "./components/Navbar";
import CartPanel from "./components/CartPanel";
import { useRoleStore } from "./store/roleStore";
import CustomerHome from "./pages/CustomerHome";
import { useOrderStore } from "./store/orderStore";
import OrderStatus from "./pages/OrderStatus";


export default function App() {
  const activeRole = useRoleStore((s) => s.activeRole);
  const activeOrder = useOrderStore((s) => s.activeOrder);

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <Navbar />

      <main className="p-6">
        {activeRole === "Customer" && <CustomerHome />}
        {activeRole === "Restaurant" && (<p className="text-[#1A1A1A]">Restaurant dashboard coming soon 🍽️</p>)}
        {activeRole === "Delivery" && (<p className="text-[#1A1A1A]">Delivery dashboard coming soon 🚴‍♂️</p>)}
        {activeRole === "Customer" && activeOrder && <OrderStatus />}
        {activeRole === "Customer" && !activeOrder && <CustomerHome />}

      </main>

      {activeRole === "Customer" && <CartPanel />}
    </div>
  );
}
