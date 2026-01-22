import { Request, Response } from 'express';
import { historyService } from '../services/historyService';
import { AuthRequest, HistorySyncRequest } from '../types';

export const getHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const { bookId } = req.query;

    const history = await historyService.getHistory(
      authReq.user.id,
      bookId as string | undefined
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const syncHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const syncRequest: HistorySyncRequest = req.body;

    if (!syncRequest.bookId || syncRequest.currentTime === undefined) {
      res.status(400).json({
        success: false,
        error: 'bookId and currentTime are required',
      });
      return;
    }

    const result = await historyService.syncHistory(authReq.user.id, syncRequest);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getRecentHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const { limit } = req.query;

    const history = await historyService.getRecentHistory(
      authReq.user.id,
      limit ? parseInt(limit as string) : 10
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
