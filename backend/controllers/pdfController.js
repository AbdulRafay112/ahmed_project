const fs = require("fs");
const pdf = require("pdf-parse");

exports.readPDF = async (req, res) => {

    try {

        const buffer = fs.readFileSync(req.file.path);

        const data = await pdf(buffer);

        const text = data.text;

        const lines = text
            .split("\n")
            .map(x => x.trim())
            .filter(x => x !== "");

        const items = [];

let description = "";

for (const line of lines) {

    const amountOnly = line.match(/^\d+(?:,\d+)?(?:\.\d+)?$/);

    if (amountOnly) {

        items.push({
            description: description.trim(),
            amount: Number(line.replace(/,/g, ""))
        });

        description = "";

    } else {

        const sameLine = line.match(/^(.*?)(\d+(?:,\d+)?(?:\.\d+)?)$/);

        if (sameLine) {

            items.push({
                description: sameLine[1].trim(),
                amount: Number(sameLine[2].replace(/,/g, ""))
            });

            description = "";

        } else {

            description += " " + line;

        }

    }

}
        res.json({
            success: true,
            items
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

}