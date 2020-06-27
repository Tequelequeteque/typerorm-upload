import fs from 'fs';
import csvParse from 'csv-parse';
import { getRepository, getCustomRepository, In } from 'typeorm';
import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransactions {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const categoryRepository = getRepository(Category);
    const transactionRepostiry = getCustomRepository(TransactionsRepository);

    const file = fs.createReadStream(filePath);
    const parses = csvParse({
      from_line: 2,
    });
    const parseCSV = file.pipe(parses);

    const transactions: CSVTransactions[] = [];
    const categories: string[] = [];
    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );
      if (!title || !type || !value) return;
      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const categoriesExists = await categoryRepository.find({
      where: { title: In(categories) },
    });

    const categoriesExistsTitles = categoriesExists.map(
      category => category.title,
    );

    const categoriesNotExists = categories
      .filter(category => !categoriesExistsTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index)
      .map(category => categoryRepository.create({ title: category }));

    const newCategories = await categoryRepository.save(categoriesNotExists);

    const finalCategories = [...newCategories, ...categoriesExists];
    const newTransactions = await transactionRepostiry.save(
      transactions.map(transaction =>
        transactionRepostiry.create({
          title: transaction.title,
          type: transaction.type,
          value: transaction.value,
          category: finalCategories.find(
            category => category.title === transaction.category,
          ),
        }),
      ),
    );

    await fs.promises.unlink(filePath);

    return newTransactions;
  }
}

export default ImportTransactionsService;
