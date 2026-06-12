import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Mock axios before importing the store
vi.mock("axios", () => {
  const instance = {
    post: vi.fn(),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    default: {
      create: vi.fn().mockReturnValue(instance),
      ...instance,
    },
  };
});

// Mock @/lib/api used by logout and getCurrentUser
vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn(),
  },
}));

const { api } = await import("@/lib/api");
const { useAuthStore } = await import("@/store/authStore");

// Get the mocked axios instance the store created
const mockAxiosInstance = axios.create();

function resetStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: false,
    hasHydrated: true,
    error: null,
  });
}

const MOCK_USER = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  roles: ["CUSTOMER"],
  activeRole: "CUSTOMER",
  secondRole: null,
  restaurantId: null,
};

describe("authStore — login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("sets user, tokens, and isAuthenticated on success", async () => {
    vi.mocked(mockAxiosInstance.post).mockResolvedValue({
      data: { data: { user: MOCK_USER, accessToken: "tok-access", refreshToken: "tok-refresh" } },
    });

    await useAuthStore.getState().login("test@example.com", "password123");

    const state = useAuthStore.getState();
    expect(state.user?.email).toBe("test@example.com");
    expect(state.accessToken).toBe("tok-access");
    expect(state.refreshToken).toBe("tok-refresh");
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("sets error on failure and throws", async () => {
    vi.mocked(mockAxiosInstance.post).mockRejectedValue({
      response: { data: { message: "Invalid credentials" } },
    });

    await expect(
      useAuthStore.getState().login("bad@x.com", "wrong")
    ).rejects.toBeDefined();

    const state = useAuthStore.getState();
    expect(state.error).toBe("Invalid credentials");
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});

describe("authStore — logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: MOCK_USER,
      accessToken: "tok-access",
      refreshToken: "tok-refresh",
      isAuthenticated: true,
      isLoading: false,
      hasHydrated: true,
      error: null,
    });
  });

  it("clears all auth state after logout", async () => {
    vi.mocked(api.post).mockResolvedValue({});

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("clears local state even if server logout fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Network error"));

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});

describe("authStore — register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("sets user and tokens on successful registration", async () => {
    vi.mocked(mockAxiosInstance.post).mockResolvedValue({
      data: { data: { user: MOCK_USER, accessToken: "tok-new", refreshToken: "tok-ref" } },
    });

    await useAuthStore.getState().register({
      email: "new@x.com",
      password: "pass",
      name: "New User",
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.name).toBe("Test User");
  });

  it("sets error on registration failure", async () => {
    vi.mocked(mockAxiosInstance.post).mockRejectedValue({
      response: { data: { error: "Email already registered" } },
    });

    await expect(
      useAuthStore.getState().register({ email: "dup@x.com", password: "pw", name: "Dup" })
    ).rejects.toBeDefined();

    expect(useAuthStore.getState().error).toBe("Email already registered");
  });
});

describe("authStore — setTokens / clearError", () => {
  beforeEach(resetStore);

  it("setTokens updates access and refresh tokens", () => {
    useAuthStore.getState().setTokens("new-access", "new-refresh");
    expect(useAuthStore.getState().accessToken).toBe("new-access");
    expect(useAuthStore.getState().refreshToken).toBe("new-refresh");
  });

  it("setTokens with only accessToken does not clear refreshToken", () => {
    useAuthStore.setState({ refreshToken: "existing-refresh" });
    useAuthStore.getState().setTokens("updated-access");
    expect(useAuthStore.getState().accessToken).toBe("updated-access");
    expect(useAuthStore.getState().refreshToken).toBe("existing-refresh");
  });

  it("clearError resets error to null", () => {
    useAuthStore.setState({ error: "Something went wrong" });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe("authStore — getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("sets user and isAuthenticated from /auth/me response", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { user: MOCK_USER } } });

    await useAuthStore.getState().getCurrentUser();

    expect(useAuthStore.getState().user?.id).toBe("user-1");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("clears auth state on TOKEN_INVALID 401", async () => {
    useAuthStore.setState({ user: MOCK_USER, isAuthenticated: true });
    vi.mocked(api.get).mockRejectedValue({
      code: 401,
      response: { status: 401, data: { code: "TOKEN_INVALID" } },
    });

    await useAuthStore.getState().getCurrentUser();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("does not clear auth state on non-definitive errors (e.g. network)", async () => {
    useAuthStore.setState({ user: MOCK_USER, isAuthenticated: true });
    vi.mocked(api.get).mockRejectedValue({ code: 500, response: { status: 500, data: {} } });

    await useAuthStore.getState().getCurrentUser();

    // Auth state preserved — we don't log out users on server errors
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
