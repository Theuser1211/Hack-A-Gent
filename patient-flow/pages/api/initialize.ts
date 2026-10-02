import { NextApiRequest, NextApiResponse } from 'next/api-router';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Validate input at the boundary
    if (!req.body.userId) {
      return res.status(400).json({
        error: {
          message: 'User ID is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Initialize database with seeded demo data
    const userPrefs = await prisma.userPrefs.create({
      data: {
        id: uuidv4(),
        userId: req.body.userId,
        seedable: true
      }
    });

    // Return structured JSON response
    return res.status(201).json({
      data: {
        userId: userPrefs.userId,
        userPrefsId: userPrefs.id
      }
    });
  } catch (error) {
    // Handle errors gracefully
    console.error(error);
    return res.status(500).json({
      error: {
        message: 'Internal Server Error',
        code: 'SERVER_ERROR'
      }
    });
  }
}