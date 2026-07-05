import { NextApiRequest, NextApiResponse } from 'next';

const calculatorApi = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const { operation, num1, num2 } = req.body;
    let result;
    switch (operation) {
      case 'add':
        result = num1 + num2;
        break;
      case 'subtract':
        result = num1 - num2;
        break;
      case 'multiply':
        result = num1 * num2;
        break;
      case 'divide':
        if (num2 !== 0) {
          result = num1 / num2;
        } else {
          return res.status(400).json({ error: 'Cannot divide by zero' });
        }
        break;
      default:
        return res.status(400).json({ error: 'Invalid operation' });
    }
    return res.status(200).json({ result });
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
};

export default calculatorApi;