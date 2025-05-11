
interface GenerateResponse {
  success: boolean;
  script: string;
  videoId: string;
}

interface CompileResponse {
  success: boolean;
  videoUrl: string;
  downloadUrl: string;
}

interface CodeResponse {
  success: boolean;
  script: string;
}

interface Prompt {
  id: string;
  prompt: string;
  createdAt: string;
  filename: string;
}

interface DeletePromptsResponse {
  success: boolean;
  message: string;
}

export const generateAnimation = async (prompt: string, token: string): Promise<GenerateResponse> => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/user/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to generate animation");
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || "Failed to generate animation");
  }
};

export const compileAnimation = async (videoId: string, token: string): Promise<CompileResponse> => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/user/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ videoId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to compile animation");
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || "Failed to compile animation");
  }
};

export const getAnimationCode = async (videoId: string, token: string): Promise<CodeResponse> => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/user/code?videoId=${videoId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to get code");
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || "Failed to get code");
  }
};

export const getUserPrompts = async (token: string): Promise<Prompt[]> => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/user/prompts`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to get prompts");
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || "Failed to get prompts");
  }
};

export const deleteUserPrompts = async (token: string): Promise<DeletePromptsResponse> => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/user/clear-history`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Check if the response has JSON content type
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`);
      }
      // If the response is OK but not JSON, return a successful response
      return { success: true, message: "Prompts deleted successfully" };
    }

    // Parse JSON response
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Failed to delete prompts");
    }

    return data;
  } catch (error: any) {
    console.error("Error in deleteUserPrompts:", error);
    throw new Error(error.message || "Failed to delete prompts");
  }
};
