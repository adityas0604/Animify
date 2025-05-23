# manim-renderer/app.py
from fastapi import FastAPI
from pydantic import BaseModel
import subprocess
import os
import uuid
import boto3
from dotenv import load_dotenv
import shutil

# Load AWS credentials from .env
load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")
S3_BUCKET = os.getenv("S3_BUCKET_NAME")

# Set up S3 client
s3 = boto3.client("s3",
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

app = FastAPI()

class RenderRequest(BaseModel):
    videoId: str
    script: str
    sceneName: str

def upload_to_s3(file_path, s3_key):
    

    s3.upload_file(
        file_path,
        S3_BUCKET,
        s3_key,
        ExtraArgs={"ContentType": "video/mp4"}
    )
    return f"https://{S3_BUCKET}.s3.amazonaws.com/{s3_key}"

@app.post("/render")
async def render(req: RenderRequest):
    # Prepare script
    os.makedirs("scripts", exist_ok=True)
    script_filename = f"{req.videoId}.py"
    script_path = os.path.join("scripts", script_filename)

    with open(script_path, "w") as f:
        f.write(req.script)

    try:
        # Run Manim to render video
        subprocess.run([
            "manim",
            "-ql",
            script_path,
            req.sceneName,
            "--media_dir", "media"
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Construct output path
        local_video_path = f"media/videos/{req.videoId}/480p15/{req.sceneName}.mp4"
        s3_key = f"videos/{req.videoId}_{uuid.uuid4().hex}.mp4"

        # Upload to S3
        s3_url = upload_to_s3(local_video_path, s3_key)

        return {
            "success": True,
            "filename": s3_key,
            "url": s3_url
        }

    except subprocess.CalledProcessError as e:
        return {
            "success": False,
            "error": str(e)
        }

    finally:
        # Clean up script
        if os.path.exists(script_path):
            os.remove(script_path)

        media_subdirs = ["media/videos", "media/images", "media/texts", "media/Tex"]
        for subdir in media_subdirs:
            if os.path.exists(subdir):
                shutil.rmtree(subdir)

        # Clean up .pyc (compiled) files
        pycache_dir = os.path.join("scripts", "__pycache__")
        if os.path.exists(pycache_dir):
            for file in os.listdir(pycache_dir):
                if file.startswith(req.videoId):
                    os.remove(os.path.join(pycache_dir, file))
            if not os.listdir(pycache_dir):
                os.rmdir(pycache_dir)
