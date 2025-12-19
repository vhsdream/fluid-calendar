export const getTitleFromPathname = (pathname: string) => {
  switch (pathname) {
    case "/calendar":
      return "Calendar | NordiCal";
    case "/tasks":
      return "Tasks | NordiCal";
    case "/focus":
      return "Focus | NordiCal";
    case "/settings":
      return "Settings | NordiCal";
    case "/setup":
      return "Setup | NordiCal";
    case "/auth/signin":
      return "Sign In | NordiCal";
    case "/auth/signup":
      return "Sign Up | NordiCal";
    case "/auth/reset-password":
      return "Reset Password | NordiCal";
    default:
      return "NordiCal";
  }
};
