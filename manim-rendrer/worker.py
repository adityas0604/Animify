import os
import json
import uuid
import shutil
import subprocess

import boto3
import psycopg2
from dotenv import load_dotenv

load_dotenv()

SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL")
DATABASE_URL = os.getenv("DATABASE_URL")
S3_BUCKET = os.getenv("S3_BUCKET_NAME")

sqs = boto3.client(
    "sqs",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION"),
)

s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION"),
)


def get_db():
    return psycopg2.connect(DATABASE_URL)


def fetch_script(video_id):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT script FROM "Video" WHERE id = %s', (video_id,))
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        conn.close()


def update_video(video_id, status, filename=None, error_msg=None):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            if filename is not None:
                cur.execute(
                    'UPDATE "Video" SET status = %s, filename = %s WHERE id = %s',
                    (status, filename, video_id),
                )
            elif error_msg is not None:
                cur.execute(
                    'UPDATE "Video" SET status = %s, "errorMsg" = %s WHERE id = %s',
                    (status, error_msg, video_id),
                )
            else:
                cur.execute(
                    'UPDATE "Video" SET status = %s WHERE id = %s',
                    (status, video_id),
                )
        conn.commit()
    finally:
        conn.close()


def process_job(video_id, scene_name):
    script = fetch_script(video_id)
    if not script:
        raise ValueError(f"No script found for videoId {video_id}")

    update_video(video_id, "PROCESSING")

    os.makedirs("scripts", exist_ok=True)
    script_path = os.path.join("scripts", f"{video_id}.py")

    with open(script_path, "w") as f:
        f.write(script)

    try:
        subprocess.run(
            ["manim", "-ql", script_path, scene_name, "--media_dir", "media"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        local_video_path = f"media/videos/{video_id}/480p15/{scene_name}.mp4"
        s3_key = f"videos/{video_id}_{uuid.uuid4().hex}.mp4"

        s3.upload_file(
            local_video_path,
            S3_BUCKET,
            s3_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

        update_video(video_id, "DONE", filename=s3_key)

    finally:
        if os.path.exists(script_path):
            os.remove(script_path)

        for subdir in ["media/videos", "media/images", "media/texts", "media/Tex"]:
            if os.path.exists(subdir):
                shutil.rmtree(subdir)

        pycache = os.path.join("scripts", "__pycache__")
        if os.path.exists(pycache):
            for f in os.listdir(pycache):
                if f.startswith(video_id):
                    os.remove(os.path.join(pycache, f))
            if not os.listdir(pycache):
                os.rmdir(pycache)


def main():
    print("Worker started, polling SQS...")
    while True:
        response = sqs.receive_message(
            QueueUrl=SQS_QUEUE_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=20,
        )

        messages = response.get("Messages", [])
        if not messages:
            continue

        message = messages[0]
        receipt_handle = message["ReceiptHandle"]
        body = json.loads(message["Body"])
        video_id = body["videoId"]
        scene_name = body["sceneName"]

        print(f"Processing: videoId={video_id}, sceneName={scene_name}")
        try:
            process_job(video_id, scene_name)
            sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=receipt_handle)
            print(f"Done: videoId={video_id}")
        except Exception as e:
            print(f"Failed: videoId={video_id}, error={e}")
            update_video(video_id, "FAILED", error_msg=str(e))
            # Don't delete the message — SQS retries up to maxReceiveCount, then sends to DLQ


if __name__ == "__main__":
    main()
