import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

app.get('/api/healthcheck', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Server is up and running' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});