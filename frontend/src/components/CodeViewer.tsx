
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CodeViewerProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  onCompile: () => void;
  isCompiling: boolean;
}

const CodeViewer = ({
  isOpen,
  onClose,
  code,
  onCompile,
  isCompiling,
}: CodeViewerProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-gradient">Animation Code</DialogTitle>
        </DialogHeader>
        
        <div className="flex justify-end mb-2">
          <Button onClick={onCompile} disabled={isCompiling}>
            {isCompiling ? "Compiling..." : "Compile Animation"}
          </Button>
        </div>
        
        <ScrollArea className="flex-1 rounded-md">
          <pre className="bg-secondary p-4 rounded-md text-sm text-muted-foreground overflow-auto">
            <code>{code}</code>
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CodeViewer;
