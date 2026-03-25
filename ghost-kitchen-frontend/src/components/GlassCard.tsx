type GlassCardProps = {
    children: React.ReactNode;
  };
  
  export default function GlassCard({ children }: GlassCardProps) {
    return (
      <div
        className="
          bg-white/70 
          backdrop-blur-xl 
          border border-white/40
          rounded-xl 
          shadow-lg
          p-4
        "
      >
        {children}
      </div>
    );
  }
  