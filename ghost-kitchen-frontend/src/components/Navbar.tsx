import { useRoleStore } from "../store/roleStore";
import type { Role } from "../store/roleStore";

const ROLES: Role[] = ["Customer", "Restaurant", "Delivery"];

export default function Navbar() {
  const activeRole = useRoleStore((state) => state.activeRole);
  const setRole = useRoleStore((state) => state.setRole);

  return (
    <header className="h-14 w-full px-6 flex items-center justify-between bg-white border-b border-gray-200">
      <h1 className="text-lg font-semibold text-[#1A1A1A]">
        Ghost Kitchen
      </h1>

      <div className="flex items-center gap-2">
        {ROLES.map((role) => (
          <button
            key={role}
            onClick={() => setRole(role)}
            className={`px-3 py-1 rounded-full text-sm transition
              ${
                activeRole === role
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }
            `}
          >
            {role}
          </button>
        ))}
      </div>
    </header>
  );
}
