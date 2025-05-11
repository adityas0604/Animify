
import { useState } from "react";
import { Button } from "@/components/ui/button";
import LoginModal from "@/components/LoginModal";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const Index = () => {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      setIsLoginModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Navigation */}
      <header className="w-full py-4 px-6 flex items-center justify-between glass-morphism z-10 fixed top-0">
        <div className="flex items-center">
          <div className="text-xl font-bold text-gradient">Prompt to Animate</div>
        </div>
        <Button variant="outline" onClick={() => setIsLoginModalOpen(true)}>
          {isAuthenticated ? "Dashboard" : "Sign In"}
        </Button>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center p-6 min-h-screen relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl"></div>
          <div className="absolute top-3/4 right-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl"></div>
          <div className="absolute bottom-1/4 left-1/2 w-80 h-80 rounded-full bg-pink-500/10 blur-3xl"></div>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-gradient max-w-3xl float-animation">
          Transform Your Ideas Into Stunning Animations
        </h1>
        <p className="text-xl md:text-2xl mb-8 max-w-2xl text-muted-foreground">
          Just describe what you want to see, and watch as our AI brings your vision to life with beautifully crafted animations.
        </p>
        <Button size="lg" onClick={handleGetStarted} className="animated-gradient">
          Get Started
        </Button>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 max-w-5xl">
          <div className="glass-morphism p-6 rounded-lg hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4 mx-auto">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3">Instant Creation</h3>
            <p className="text-muted-foreground">Type a prompt and get a custom animation in seconds.</p>
          </div>
          <div className="glass-morphism p-6 rounded-lg hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4 mx-auto">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3">Code Access</h3>
            <p className="text-muted-foreground">View and modify the generated code for ultimate control.</p>
          </div>
          <div className="glass-morphism p-6 rounded-lg hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4 mx-auto">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3">Easy Export</h3>
            <p className="text-muted-foreground">Download your animations with one click.</p>
          </div>
        </div>
      </section>

      <footer className="w-full py-8 px-6 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Prompt to Animate. All rights reserved.</p>
      </footer>

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </div>
  );
};

export default Index;
