type Props = {
    children: React.ReactNode;
    bottomNav?: React.ReactNode;
  };
  
  export default function AppShell({ children, bottomNav }: Props) {
    return (
      <div className="h-screen flex flex-col bg-[#F2F4F6]">
        <div className="flex-1 overflow-y-auto">{children}</div>
        {bottomNav && (
          <div className="border-t bg-white">{bottomNav}</div>
        )}
      </div>
    );
  }
  