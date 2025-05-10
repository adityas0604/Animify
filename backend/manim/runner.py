# backend/manim/runner.py
import sys
import subprocess
import os

def run_manim(script_path, class_name):
    media_dir = os.path.join(os.path.dirname(script_path), "media", "videos")
    
    cmd = [
        "manim",
        "-pql",
        script_path,
        class_name,
        "--media_dir", media_dir
    ]
    
    try:
        print("Running:", " ".join(cmd))
        subprocess.run(cmd, check=True)
        return True, os.path.join("script", "1080p60", f"{class_name}.mp4")
    except subprocess.CalledProcessError as e:
        return False, str(e)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python runner.py <script_path> <class_name>")
        sys.exit(1)
    
    success, output = run_manim(sys.argv[1], sys.argv[2])
    
    if success:
        print(f"✅ Video saved at: {output}")
        sys.exit(0)
    else:
        print(f"❌ Error: {output}")
        sys.exit(1)
