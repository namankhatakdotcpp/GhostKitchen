export function getRoleDashboard(activeRole: string): string {
  switch (activeRole) {
    case "RESTAURANT": return "/shop"
    case "DELIVERY":   return "/delivery"
    case "ADMIN":      return "/admin/dashboard"
    default:           return "/"
  }
}
