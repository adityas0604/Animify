
import { Button } from "@/components/ui/button";
import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface VideoPlayerProps {
  videoUrl: string | null;
  downloadUrl?: string | null;
  isCompiling?: boolean;
}

const VideoPlayer = ({ videoUrl, downloadUrl, isCompiling = false }: VideoPlayerProps) => {
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!videoUrl) {
      setProcessedUrl(null);
      return;
    }

    setIsLoading(true);

    // videoUrl is now always a direct pre-signed URL from the backend
    setProcessedUrl(videoUrl);
    setIsLoading(false);
  }, [videoUrl]);

  const handleDownload = () => {
    // Use the dedicated downloadUrl if available, otherwise fall back to processedUrl
    const urlToDownload = downloadUrl || processedUrl;
    if (!urlToDownload) return;
    
    const link = document.createElement("a");
    link.href = urlToDownload;
    link.download = `animation-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full glass-morphism rounded-lg">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-xl font-semibold text-gradient">Animation Preview</h2>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
            <p className="mt-4 text-muted-foreground">Loading animation...</p>
          </div>
        ) : isCompiling ? (
          <div className="flex flex-col items-center justify-center animate-pulse">
            <LoaderCircle className="h-16 w-16 text-primary animate-spin" />
            <p className="mt-6 text-xl font-medium">Generating Animation...</p>
            <p className="mt-2 text-muted-foreground text-center max-w-md">
              This may take a few moments as we create your animation. Please wait.
            </p>
          </div>
        ) : processedUrl ? (
          <div className="w-full h-full flex flex-col">
            <div className="flex-1 relative w-full rounded-md overflow-hidden bg-black/40 flex items-center justify-center">
              <video
                src={processedUrl}
                controls
                className="max-h-full max-w-full"
                onError={(e) => console.error("Video loading error:", e)}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleDownload}
                variant="outline"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4 mx-auto pulse-animation">
              <svg className="w-12 h-12 text-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium mb-2">No Video Yet</h3>
            <p className="max-w-md mx-auto">
              Enter a prompt in the chat box and click "Compile" to generate an animation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
