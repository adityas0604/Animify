# Animify — EC2 Worker Deployment Guide

This guide sets up the Manim render worker on an AWS EC2 instance.
The worker polls an SQS queue for render jobs, runs Manim, uploads the result to S3, and updates the database.

---

## Architecture Overview

```
Frontend  →  POST /compile  →  Express backend
                                    │
                              SQS Queue (animify-render-queue)
                                    │
                              EC2 Worker (worker.py)
                                    │
                         runs manim → uploads to S3 → updates DB
                                    │
              Frontend polls GET /videos/:id/status until DONE
```

---

## Prerequisites

- AWS account with access to SQS, S3, EC2, and IAM
- The PostgreSQL database already running and accessible
- The Express backend already deployed with `SQS_QUEUE_URL` in its environment
- An S3 bucket already created for video storage

---

## Step 1 — Create the SQS Dead Letter Queue

Go to **AWS Console → SQS → Create queue**:

| Setting | Value |
|---------|-------|
| Type | Standard |
| Name | `animify-render-dlq` |

Leave all other settings as default. Click **Create queue** and copy the ARN.

---

## Step 2 — Create the Main SQS Queue

Go to **AWS Console → SQS → Create queue** again:

| Setting | Value |
|---------|-------|
| Type | Standard |
| Name | `animify-render-queue` |
| Visibility timeout | `300` seconds |
| Message retention period | `86400` seconds (1 day) |
| Receive message wait time | `20` seconds |

Scroll down to **Dead-letter queue**:
- Enable it
- Select `animify-render-dlq`
- Maximum receives: `3`

Click **Create queue** and copy the **Queue URL** — you will need it later.

---

## Step 3 — Create an IAM Role for EC2

This allows the EC2 instance to access SQS and S3 without hardcoding credentials.

1. Go to **AWS Console → IAM → Roles → Create role**
2. Trusted entity type: **AWS service → EC2**
3. Attach these managed policies:
   - `AmazonSQSFullAccess`
   - `AmazonS3FullAccess`
4. Name the role: `animify-worker-role`
5. Click **Create role**

---

## Step 4 — Launch the EC2 Instance

Go to **AWS Console → EC2 → Launch instance**:

| Setting | Value |
|---------|-------|
| Name | `animify-worker` |
| AMI | Ubuntu Server 22.04 LTS |
| Instance type | `t3.medium` (minimum — Manim is CPU heavy) |
| Key pair | Create a new key pair, download the `.pem` file and keep it safe |
| IAM instance profile | `animify-worker-role` |

Under **Network settings → Security group**, add one inbound rule:
- Type: SSH
- Port: 22
- Source: My IP

No other ports need to be open — the worker only makes outbound calls.

Click **Launch instance**.

---

## Step 5 — SSH Into the Instance

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<your-ec2-public-ip>
```

The public IP is shown in EC2 Console → Instances → your instance.

---

## Step 6 — Install System Dependencies

Run these on the EC2 instance. LaTeX is large — this will take a few minutes.

```bash
sudo apt-get update && sudo apt-get upgrade -y

sudo apt-get install -y \
    python3-pip python3-venv git \
    ffmpeg \
    libcairo2-dev libpango1.0-dev \
    texlive texlive-latex-extra \
    pkg-config
```

---

## Step 7 — Copy the Worker Code to EC2

Run this from your **local machine** (not EC2):

```bash
scp -i your-key.pem -r /path/to/Animify/manim-rendrer ubuntu@<ec2-public-ip>:~/manim-rendrer
```

---

## Step 8 — Install Python Dependencies

Back on EC2:

```bash
cd ~/manim-rendrer
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## Step 9 — Create the `.env` File

```bash
nano ~/manim-rendrer/.env
```

Paste the following and fill in your values:

```
SQS_QUEUE_URL=https://sqs.<region>.amazonaws.com/<account-id>/animify-render-queue
DATABASE_URL=postgresql://user:password@your-db-host:5432/dbname
S3_BUCKET_NAME=your-s3-bucket-name
AWS_REGION=us-east-1
```

> **Note:** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are not needed here.
> The EC2 IAM role attached in Step 3 handles AWS authentication automatically.

Save and exit (`Ctrl+X → Y → Enter`).

---

## Step 10 — Run the Prisma Migration

This adds the `status` and `errorMsg` columns to the `Video` table.
Run this from your **local machine** inside the `backend/` directory, with `DATABASE_URL` set in your local `.env`:

```bash
cd /path/to/Animify/backend
npx prisma migrate dev --name add_video_status
```

---

## Step 11 — Test the Worker Manually

On EC2, run the worker directly first to confirm everything works:

```bash
cd ~/manim-rendrer
source venv/bin/activate
python worker.py
```

Expected output:
```
Worker started, polling SQS...
```

Now go to the Animify app and click **Compile** on an animation. You should see:
```
Processing: videoId=..., sceneName=...
Done: videoId=...
```

And the video should appear in the UI shortly after.

Once confirmed working, stop the worker (`Ctrl+C`) and proceed to the next step.

---

## Step 12 — Run as a systemd Service

This keeps the worker running permanently and restarts it automatically on crash or reboot.

Create the service file:

```bash
sudo nano /etc/systemd/system/animify-worker.service
```

Paste:

```ini
[Unit]
Description=Animify Manim Render Worker
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/manim-rendrer
ExecStart=/home/ubuntu/manim-rendrer/venv/bin/python worker.py
Restart=always
RestartSec=5
EnvironmentFile=/home/ubuntu/manim-rendrer/.env

[Install]
WantedBy=multi-user.target
```

Save and exit, then enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable animify-worker
sudo systemctl start animify-worker
```

---

## Useful Commands

| Command | Purpose |
|---------|---------|
| `sudo systemctl status animify-worker` | Check if the worker is running |
| `sudo systemctl restart animify-worker` | Restart after code changes |
| `sudo systemctl stop animify-worker` | Stop the worker |
| `sudo journalctl -u animify-worker -f` | Live log stream |
| `sudo journalctl -u animify-worker --since "1 hour ago"` | Recent logs |

---

## Deploying Code Updates

When `worker.py` changes, copy the new file to EC2 and restart:

```bash
# From local machine
scp -i your-key.pem /path/to/Animify/manim-rendrer/worker.py ubuntu@<ec2-ip>:~/manim-rendrer/worker.py

# On EC2
sudo systemctl restart animify-worker
```

---

## Final Checklist

- [ ] `animify-render-dlq` SQS queue created
- [ ] `animify-render-queue` SQS queue created with DLQ configured
- [ ] IAM role `animify-worker-role` created with SQS + S3 access
- [ ] EC2 instance launched with `animify-worker-role` attached
- [ ] System dependencies installed (ffmpeg, LaTeX, Cairo)
- [ ] Worker code copied to EC2
- [ ] Python venv created and `requirements.txt` installed
- [ ] `.env` file created on EC2 with correct values
- [ ] Prisma migration run (`add_video_status`)
- [ ] Manual test passed (worker picked up a job and video appeared in UI)
- [ ] `animify-worker` systemd service enabled and running
- [ ] Express backend has `SQS_QUEUE_URL` in its environment
