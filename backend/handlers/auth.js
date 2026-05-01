'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { response, parseBody } = require('../lib/lambda');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

exports.signup = async (event) => {
  const { email, username, password } = parseBody(event);
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, username, password: hashedPassword },
    });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return response(200, { token });
  } catch {
    return response(400, { error: 'Email or username already exists' });
  }
};

exports.login = async (event) => {
  const { email, password } = parseBody(event);
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return response(400, { error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return response(400, { error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return response(200, { token });
  } catch (err) {
    console.error(err);
    return response(500, { error: 'Internal server error' });
  }
};
