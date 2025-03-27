import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';

dotenv.config();

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

app.post("/generate-copies", async (req, res) => {
    const { urls } = req.body;

    if (!urls || urls.length !== 3) {
        return res.status(400).json({ error: "Debe proporcionar 3 URLs." });
    }

    try {
        const articlesPromises = urls.map(async (url, i) => {
            try {
                const response = await fetch(url);
                const html = await response.text();
                const $ = cheerio.load(html);

                const title = $('meta[property="og:title"]').attr('content');
                const description = $('meta[property="og:description"]').attr('content');
                const imageUrl = $('meta[property="og:image"]').attr('content');
                
                if (!title || !description || !imageUrl) {
                    throw new Error("Meta tags faltantes");
                }

                const titlePrompt = `Genera UN SOLO TÍTULO (forzosamente máximo 86 caracteres, incluso trata que sean poquitos menos) a partir del siguiente texto: "${title}. No contestes nada más aparte del título, NADA. Solamente contesta con un solo título, ni palabras tuyas, ni nada extra. Mantén el estilo y espíritu del título original.Si la noticia original sí tiene el numero de carácteres permitidos dámela directamente`;
                const summaryPrompt = `Genera un resumen (forzosamente máximo 82 caracteres, incluso trata que sean poquitos menos) a partir del siguiente texto: "${title}.Este texto tiene de descripción complementaria: ${description}" No contestes nada más aparte del resumen, NADA. Solamente contesta con un solo resumen, ni palabras tuyas, ni nada extra.`;
                const categoryPrompt = `Genera una categoría para esta noticia (forzosamente máximo 30 caracteres, incluso trata que sean  menos) a partir del siguiente texto: "${title}.Este texto tiene de descripción complementaria: ${description}" No contestes nada más aparte de la categoría, NADA. Solamente contesta con una sola categoría, ni palabras tuyas, ni nada extra.`;

                const [fbCopy, summary, category] = await Promise.all([
                    model.generateContent([titlePrompt]),
                    model.generateContent([summaryPrompt]),
                    model.generateContent([categoryPrompt])
                ]);

                const fbText = fbCopy.response.text() || "Texto no disponible";
                const summaryText = summary.response.text() || "Resumen no disponible";
                const categoryText = category.response.text() || "Categoría no disponible";

                const author = "Autor Desconocido";

                if (i === 0) {
                    return {
                        title: fbText,
                        url: url,
                        imageUrl: imageUrl,
                        summary: summaryText,
                        author: author,
                        category: categoryText,
                    };
                } else {
                    const shortTitlePrompt = `Genera UN SOLO TÍTULO (forzosamente máximo 86 caracteres, incluso trata que sean poquitos menos) a partir del siguiente texto: "${title}. No contestes nada más aparte del título, NADA. Solamente contesta con un solo título, ni palabras tuyas, ni nada extra. Mantén el estilo y espíritu del título original..Si la noticia original sí tiene el numero de carácteres permitidos dámela directamente`;
                    const shortTitle = await model.generateContent([shortTitlePrompt]);

                    const shortTitleText = shortTitle.response.text() || "Título corto no disponible";

                    return {
                        title: shortTitleText,
                        url: url,
                        imageUrl: imageUrl,
                        category: categoryText,
                    };
                }

            } catch (error) {
                return { error: `Error en la URL ${url}: ${error.message}` };
            }
        });

        const articles = await Promise.all(articlesPromises);

        const errors = articles.filter(article => article.error);
        if (errors.length > 0) {
            return res.status(400).json({ errors });
        }

        res.json({ articles });
    } catch (error) {
        console.error("Error al generar los copys:", error);
        res.status(500).json({ error: "Hubo un error al generar los copys." });
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});

export default app;
