
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import ChatBox from "@/components/ChatBox";
import VideoPlayer from "@/components/VideoPlayer";
import CodeViewer from "@/components/CodeViewer";
import { compileAnimation, getAnimationCode } from "@/api/animationApi";

const Dashboard = () => {
  const { logout, token } = useAuth();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [currentCode, setCurrentCode] = useState("");
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  const handleViewCode = async (videoId: string) => {
    try {
      const response = await getAnimationCode(videoId, token!);
      if (response.success) {
        setCurrentCode(response.script);
        setCurrentVideoId(videoId);
        setCodeViewerOpen(true);
      } else {
        toast.error("Failed to retrieve animation code");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to retrieve animation code");
    }
  };

  const handleCompile = async (videoId: string) => {
    try {
      setIsCompiling(true);
      setCodeViewerOpen(false);
      
      const response = await compileAnimation(videoId, token!);
      if (response.success) {
        toast.success("Animation compiled successfully!");
        // Store both URLs from the response
        setVideoUrl(response.videoUrl);
        setDownloadUrl(response.downloadUrl);
        console.log("Video URL received:", response.videoUrl);
        console.log("Download URL received:", response.downloadUrl);
      } else {
        toast.error("Failed to compile animation");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to compile animation");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleCompileFromViewer = () => {
    if (currentVideoId) {
      handleCompile(currentVideoId);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="w-full py-4 px-6 flex items-center justify-between glass-morphism z-10">
        <div className="flex items-center">
          <div className="text-xl font-bold text-gradient">Prompt to Animate</div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 mt-16">
        <div className="w-full md:w-2/5 h-[calc(100vh-8rem)]">
          <ChatBox 
            onViewCode={handleViewCode}
            onCompile={handleCompile}
            isCompiling={isCompiling}
          />
        </div>
        <div className="w-full md:w-3/5 h-[calc(100vh-8rem)]">
          <VideoPlayer 
            videoUrl={videoUrl} 
            downloadUrl={downloadUrl} 
            isCompiling={isCompiling}
          />
        </div>
      </div>

      {/* Code Viewer Dialog */}
      <CodeViewer
        isOpen={codeViewerOpen}
        onClose={() => setCodeViewerOpen(false)}
        code={currentCode}
        onCompile={handleCompileFromViewer}
        isCompiling={isCompiling}
      />
    </div>
  );
};

export default Dashboard;
