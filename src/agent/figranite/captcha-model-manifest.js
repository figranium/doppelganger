const MODEL_MANIFESTS = Object.freeze({
    owlvit: Object.freeze({
        id: 'Xenova/owlvit-base-patch32',
        revision: 'b75f4e52949639c3bb0b96546ea4149482f6e7ef',
        dtype: 'q8',
        kind: 'owlvit',
        minimumTotalMb: 2048,
        minimumAvailableMb: 512,
        threshold: 0.12,
        files: Object.freeze([
            { path: 'config.json', size: 583, sha256: 'd64b634b32bcc85f1580d103f731a6949d9cbb9749f19eb75b6e06c86b81eb28' },
            { path: 'merges.txt', size: 524619, sha256: '9fd691f7c8039210e0fced15865466c65820d09b63988b0174bfe25de299051a' },
            { path: 'preprocessor_config.json', size: 576, sha256: '7f1386f6b36981b62f76447375ec20470656179fea4e47b6e22e2d896376e8ce' },
            { path: 'special_tokens_map.json', size: 460, sha256: 'f118ab3a983206e4f32583448de6bd6aae4ee21869135cef1f5848a753cdaab6' },
            { path: 'tokenizer.json', size: 2224253, sha256: '50b24e94079fb11cb1503f65fef0ed08044186a1cd118c79683991554d9a5b23' },
            { path: 'tokenizer_config.json', size: 925, sha256: '2c49c1bc8de9f6f5189fb3e6cbadfe656431174a83064be3aac4f6e0f131f7d0' },
            { path: 'vocab.json', size: 862328, sha256: '5047b556ce86ccaf6aa22b3ffccfc52d391ea4accdab9c2f2407da5b742d4363' },
            { path: 'onnx/model_quantized.onnx', size: 155431700, sha256: '06af49bd5db977936bcddad2b45d0031072673517579d15b8cb42bf015a94156' }
        ])
    }),
    florence2: Object.freeze({
        id: 'onnx-community/Florence-2-base-ft',
        revision: 'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f',
        dtype: Object.freeze({
            embed_tokens: 'fp16',
            vision_encoder: 'fp16',
            encoder_model: 'q4',
            decoder_model_merged: 'q4'
        }),
        kind: 'florence2',
        minimumTotalMb: 8192,
        minimumAvailableMb: 2048,
        threshold: 0.18,
        files: Object.freeze([
            { path: 'added_tokens.json', size: 22410, sha256: 'ba67457c577895525996e7a42d7da60a05856506ea4fd25ff9a023a64662f74b' },
            { path: 'config.json', size: 5432, sha256: 'd90c22ed72eb55291f183fcd9b98ebd3bd3d92bfcffb6c7f6e1606085e793525' },
            { path: 'generation_config.json', size: 292, sha256: '7b8eb17bbd6cf8a07f619ad83ae03881eff05b6b9237bab89005b40e77783c29' },
            { path: 'merges.txt', size: 456318, sha256: '1ce1664773c50f3e0cc8842619a93edc4624525b728b188a9e0be33b7726adc5' },
            { path: 'preprocessor_config.json', size: 2673, sha256: 'c892857e34a7082284983a7717717d39c9bf7e574f1f41d80d4c918c97502efa' },
            { path: 'special_tokens_map.json', size: 146627, sha256: '72ff172dc769bc1551b1b4211628ce3271643bc60379e4da45d85a9be9332c39' },
            { path: 'tokenizer.json', size: 2297961, sha256: 'd69dcdb2323e124ac4f800cb9863ddccea0d7bb11e16125e8df3bd60f2f8aeac' },
            { path: 'tokenizer_config.json', size: 197658, sha256: 'd8e64607233cb53b619fb46664f6cad08176c26e0e8735b2d30d888364f19600' },
            { path: 'vocab.json', size: 1099884, sha256: '394fdc63c71aabe0a9b97117f5d62fb5fcc4d59b2b3ea929a3929e6a53217b3c' },
            { path: 'onnx/embed_tokens_fp16.onnx', size: 78780290, sha256: 'da2607930eea5e21e4a2bd5fd069de550f1acc30316a4e8f824551a95232ba39' },
            { path: 'onnx/vision_encoder_fp16.onnx', size: 183930536, sha256: 'a7abcd77199c5d0089cf985ede4dd8089acd84f30fb3fb1462d5930345c688b3' },
            { path: 'onnx/encoder_model_q4.onnx', size: 30058778, sha256: '34b17bcf191dacb79bd482b94bad5cf1ba39bc770f6a4c9ae26f28b89c235e4b' },
            { path: 'onnx/decoder_model_merged_q4.onnx', size: 64393474, sha256: 'be7a2f33e65f8d65538024772fda4d1c5a7752d60a7159aadf53f9f4798b90fa' }
        ])
    })
});

const APPLE_MLX_MANIFEST = Object.freeze({
    id: 'mlx-community/Florence-2-base-ft-4bit',
    revision: 'cfed5ed3e86826b6aa2902abf6cf2e406fd94504',
    kind: 'florence2-mlx',
    threshold: 0.18,
    files: Object.freeze([
        { path: 'added_tokens.json', size: 22410, sha256: 'ba67457c577895525996e7a42d7da60a05856506ea4fd25ff9a023a64662f74b' },
        { path: 'config.json', size: 6703, sha256: '7f45016c8c9941e33939269e28c28ea2adca3dfe8ae2b8e21f9ceab4953f396f' },
        { path: 'merges.txt', size: 456318, sha256: '1ce1664773c50f3e0cc8842619a93edc4624525b728b188a9e0be33b7726adc5' },
        { path: 'model.safetensors', size: 163524711, sha256: '904321eedba8cf7bb1d7258e08d4efb6b8b2f62dc154d530b7ff663f240df533' },
        { path: 'model.safetensors.index.json', size: 96965, sha256: '3a5d577309a948bacd44141544167fd60d6dc7e8ad8825e0ec728fbce56369a1' },
        { path: 'preprocessor_config.json', size: 603, sha256: '1396ec5a0a7adfe1c04fb777b09e8ba753be6dbb5868212ab3c3ef39d91fe031' },
        { path: 'processing_florence2.py', size: 46372, sha256: '4bd7158536cbf1c7891fc8efd94437d79fd09f07f539c7398fab8a885d7d8bca' },
        { path: 'processor_config.json', size: 130, sha256: '6eb1a2e487fa8b7521691a3382b5afd92a78e8ea34b385f8824fa07563e92245' },
        { path: 'special_tokens_map.json', size: 439927, sha256: '20f95a5768e5d9d14ab9bebbf844c1750ece27765109ce35be9a629db630aedc' },
        { path: 'tokenizer.json', size: 3747961, sha256: '9b466914d9e7f9a39936c9bbe2ac28c86cd8b35c83a905699b01f83178f27c51' },
        { path: 'tokenizer_config.json', size: 232317, sha256: '06e57de7118812e63652f83c779ed1608712418c37cd8f7e4cec4380c6f43810' },
        { path: 'vocab.json', size: 798293, sha256: 'ed19656ea1707df69134c4af35c8ceda2cc9860bf2c3495026153a133670ab5e' }
    ])
});

module.exports = { MODEL_MANIFESTS, APPLE_MLX_MANIFEST };
