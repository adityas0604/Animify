import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthContext";
import { generateAnimation, getUserPrompts, deleteUserPrompts } from "@/api/animationApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Message {
  id: string;
  content: string;
  sender: "user" | "system";
  videoId?: string;
  isLatest?: boolean;
}

interface Prompt {
  id: string;
  prompt: string;
  createdAt: string;
  filename: string;
}

interface ChatBoxProps {
  onViewCode: (videoId: string) => void;
  onCompile: (videoId: string) => void;
  isCompiling?: boolean;
}

const ChatBox = ({ onViewCode, onCompile, isCompiling = false }: ChatBoxProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const { token } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch user prompts on component mount using useEffect instead of React Query
  useEffect(() => {
    const fetchPrompts = async () => {
      if (!token) {
        setIsLoadingPrompts(false);
        return;
      }
      
      setIsLoadingPrompts(true);
      try {
        console.log("Fetching prompts with token:", token.substring(0, 10) + "...");
        const data = await getUserPrompts(token);
        console.log("Fetched prompts:", data);
        
        if (data && data.length > 0) {
          // Convert prompts to messages
          const promptMessages: Message[] = [];
          
          // Add welcome message at the beginning
          promptMessages.push({
            id: "welcome",
            content: "Welcome! Describe the animation you'd like to create.",
            sender: "system",
          });
          
          // Process each prompt and create user/system message pairs
          data.forEach((prompt, index) => {
            // Add user message
            promptMessages.push({
              id: `user-${prompt.id}`,
              content: prompt.prompt,
              sender: "user",
            });
            
            // Add system response message - only the most recent prompt gets the successful message with buttons
            const isLastItem = index === data.length - 1;
            
            promptMessages.push({
              id: `system-${prompt.id}`,
              content: isLastItem 
                ? "Animation script generated successfully! Click 'View Code' to see the generated script." 
                : "Animation script generated.",
              sender: "system",
              videoId: prompt.id,
              isLatest: isLastItem, // Only the most recent prompt gets action buttons
            });
          });
          
          setMessages(promptMessages);
          console.log("Set messages from prompts:", promptMessages);
        } else {
          // If no prompts, just show welcome message
          setMessages([{
            id: "welcome",
            content: "Welcome! Describe the animation you'd like to create.",
            sender: "system",
          }]);
        }
      } catch (error: any) {
        console.error("Error fetching prompts:", error);
        toast.error("Failed to load your previous prompts");
        // Set welcome message even on error
        setMessages([{
          id: "welcome",
          content: "Welcome! Describe the animation you'd like to create.",
          sender: "system",
        }]);
      } finally {
        setIsLoadingPrompts(false);
      }
    };

    fetchPrompts();
  }, [token]); // Re-run when token changes

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: input,
      sender: "user",
    };

    setMessages((prev) => [...prev.map(msg => ({ ...msg, isLatest: false })), userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Reset isLatest flag for all previous messages
      const response = await generateAnimation(input, token!);

      const systemMessage: Message = {
        id: `system-${Date.now()}`,
        content: "Animation script generated successfully! Click 'View Code' to see the generated script.",
        sender: "system",
        videoId: response.videoId,
        isLatest: true,
      };

      setMessages((prev) => [...prev, systemMessage]);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate animation");
      const errorMessage: Message = {
        id: `system-${Date.now()}`,
        content: `Error: ${error.message || "Something went wrong"}`,
        sender: "system",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!token) return;
    
    setIsDeletingHistory(true);
    try {
      console.log("Attempting to clear history...");
      const response = await deleteUserPrompts(token);
      console.log("Delete response:", response);
      
      // Reset messages to just show the welcome message
      setMessages([{
        id: "welcome",
        content: "Welcome! Describe the animation you'd like to create.",
        sender: "system",
      }]);
      toast.success("History cleared successfully");
      
    } catch (error: any) {
      console.error("Error clearing history:", error);
      toast.error(error.message || "Failed to clear history");
    } finally {
      setIsDeletingHistory(false);
      setIsConfirmDialogOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-full glass-morphism rounded-lg">
      <div className="p-4 border-b border-white/10 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gradient">Prompt Chat</h2>
        {messages.length > 1 && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsConfirmDialogOpen(true)}
            className="text-xs"
            disabled={isDeletingHistory}
          >
            {isDeletingHistory ? (
              <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white mr-1" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            Clear History
          </Button>
        )}
      </div>
      
      <ScrollArea className="flex-1 p-4">
        {isLoadingPrompts ? (
          <div className="flex justify-center items-center h-40">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-white"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "p-3 rounded-lg max-w-[85%] animate-fade-in",
                  message.sender === "user"
                    ? "ml-auto bg-primary/20 text-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.videoId && message.isLatest && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewCode(message.videoId!)}
                      disabled={isCompiling}
                    >
                      View Code
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onCompile(message.videoId!)}
                      disabled={isCompiling}
                    >
                      {isCompiling ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white mr-1" />
                      ) : "Compile"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter your prompt here..."
            className="resize-none"
            rows={2}
            disabled={isLoading || isCompiling}
          />
          <Button type="submit" size="icon" disabled={isLoading || isCompiling}>
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>

      {/* Confirmation Dialog */}
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear History</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all your prompts and animations from the server. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingHistory}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearHistory}
              disabled={isDeletingHistory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingHistory ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatBox;
