import json
import logging
import time
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

KIE_MODEL = 'nano-banana-pro'


def _headers():
    return {
        'Authorization': f'Bearer {settings.KIE_AI_API_KEY}',
        'Content-Type': 'application/json',
    }


def create_generation_task(
    prompt: str,
    image_url: str | None = None,
    image_urls: list[str] | None = None,
    aspect_ratio: str = '16:9',
    resolution: str = '2K',
    output_format: str = 'png',
) -> str:
    if image_urls:
        img_list = image_urls
    elif image_url:
        img_list = [image_url]
    else:
        img_list = []

    payload = {
        'model': KIE_MODEL,
        'input': {
            'prompt': prompt,
            'image_input': img_list,
            'aspect_ratio': aspect_ratio,
            'resolution': resolution,
            'output_format': output_format,
        },
    }

    resp = requests.post(
        f'{settings.KIE_AI_BASE_URL}/api/v1/jobs/createTask',
        headers=_headers(),
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get('code') != 200:
        raise RuntimeError(f"Kie.ai error: {data.get('msg', 'Unknown error')}")

    task_id = data['data']['taskId']
    logger.info(f"Created Kie.ai task: {task_id}")
    return task_id


def get_task_status(task_id: str) -> dict:
    resp = requests.get(
        f'{settings.KIE_AI_BASE_URL}/api/v1/jobs/recordInfo',
        headers=_headers(),
        params={'taskId': task_id},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get('code') != 200:
        raise RuntimeError(f"Kie.ai status error: {data.get('msg', 'Unknown error')}")

    task_data = data['data']
    result = {
        'task_id': task_data.get('taskId', task_id),
        'state': task_data.get('state', 'pending'),
        'cost_time': task_data.get('costTime'),
    }

    if task_data.get('state') == 'success' and task_data.get('resultJson'):
        result_json = json.loads(task_data['resultJson'])
        result['result_urls'] = result_json.get('resultUrls', [])

    if task_data.get('state') == 'failed':
        result['error'] = task_data.get('failMsg', 'Unknown error')

    return result


def wait_for_result(task_id: str, max_attempts: int = 60, interval: int = 3) -> str:
    for _ in range(max_attempts):
        status = get_task_status(task_id)

        if status['state'] == 'success':
            urls = status.get('result_urls', [])
            if urls:
                return urls[0]
            raise RuntimeError('Task succeeded but no result URLs returned')

        if status['state'] == 'failed':
            raise RuntimeError(f"Task failed: {status.get('error', 'Unknown')}")

        time.sleep(interval)

    raise TimeoutError(f'Task {task_id} timed out after {max_attempts * interval}s')


def check_credits() -> dict:
    resp = requests.get(
        f'{settings.KIE_AI_BASE_URL}/api/v1/chat/credit',
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get('data', {})


QUALITY_PREFIX = {
    'preview': 'high quality render',
    'standard': 'high quality render, detailed',
    'high': 'ultra high quality, 4K resolution, highly detailed, sharp focus',
}

SPACE_TYPES = {
    'living_room': 'spacious modern living room with large windows',
    'bedroom': 'cozy elegant bedroom',
    'bathroom': 'modern spa-like bathroom',
    'kitchen': 'contemporary open kitchen',
    'office': 'professional home office',
    'lobby': 'grand entrance lobby with high ceilings',
    'restaurant': 'upscale restaurant interior',
    'outdoor': 'beautiful outdoor patio area',
    'pool': 'luxury pool area with lounging space',
    'bathroom_classic': 'classic elegant bathroom with ornate details',
    'patio': 'beautiful outdoor patio with seating area',
    'garden': 'lush garden area with landscaping',
    'entrance': 'grand entrance foyer with statement design',
}

DESIGN_STYLES = {
    'modern': 'modern minimalist interior design, clean lines, contemporary furniture',
    'classic': 'classic traditional interior design, elegant ornate details, timeless furniture',
    'arabic': 'arabic islamic interior design, geometric patterns, ornate arches',
    'scandinavian': 'scandinavian interior design, light wood, white walls, cozy minimalist',
    'industrial': 'industrial interior design, exposed brick, metal elements, raw materials',
    'luxury': 'luxury high-end interior design, premium materials, sophisticated details',
    'rustic': 'rustic interior design, natural wood beams, stone elements, warm cottage feel',
    'contemporary': 'contemporary interior design, current trends, artistic touches',
}

LIGHTING_OPTIONS = {
    'natural': 'natural daylight streaming through large windows, bright and airy',
    'warm': 'warm ambient interior lighting, cozy atmosphere, soft warm tones',
    'dramatic': 'dramatic high contrast lighting, bold shadows, cinematic mood',
    'soft': 'soft diffused lighting, even illumination, no harsh shadows',
    'evening': 'evening interior lighting, warm lamp glow, relaxed ambiance',
    'studio': 'professional studio lighting, perfectly balanced, commercial quality',
}

CAMERA_ANGLES = {
    'eye_level': 'eye-level perspective shot, natural standing viewer height',
    'low_angle': 'low angle shot, emphasizes floor and space height',
    'overhead': 'overhead view, looking down at the space',
    'bird_eye': 'overhead view, looking down at the space',
    'corner': 'corner composition showing two walls and floor, creates depth',
    'close_up': 'close-up detail shot, focused on material texture',
}

MOODS = {
    'warm': 'warm and inviting atmosphere',
    'calm': 'serene calm atmosphere, peaceful and relaxing',
    'serene': 'serene calm atmosphere, peaceful and relaxing',
    'energetic': 'vibrant energetic atmosphere, lively and dynamic',
    'elegant': 'elegant refined atmosphere, sophisticated and polished',
    'cozy': 'cozy comfortable atmosphere, homey feeling',
}

NEGATIVE_PROMPT = (
    "blurry, low quality, distorted, unrealistic proportions, "
    "bad lighting, amateur, cartoon, illustration, painting, sketch, "
    "collage, grid layout, split screen, multiple angles in one image, "
    "comparison layout, side by side, before and after, dual view, "
    "text overlay, logo, watermark, brand name, label"
)


def _get_val(mapping: dict, key: str, fallback: str = '') -> str:
    return mapping.get(key, fallback)


# ─── Universal building blocks ───────────────────────────────────────────────

UNIVERSAL_OPENER = (
    "Create ONE single photorealistic image. "
    "Do NOT create a collage, grid, split-screen, or multiple views. "
    "Use ONLY one camera angle per image."
)

UNIVERSAL_FOOTER = (
    "Photorealistic, architectural photography style, 4K quality, realistic shadows and lighting. "
    "No text, no logo, no watermark."
)


def _scene_desc(selections: dict) -> str:
    space = _get_val(SPACE_TYPES, selections.get('space_type', 'living_room'),
                     selections.get('space_type_prompt', 'modern interior room'))
    style = _get_val(DESIGN_STYLES, selections.get('design_style', 'modern'),
                     selections.get('design_style_prompt', 'modern minimalist design'))
    return f"{space}, {style}"


def _light_camera_mood(selections: dict) -> str:
    light = _get_val(LIGHTING_OPTIONS, selections.get('lighting', 'natural'),
                     selections.get('lighting_prompt', 'natural daylight'))
    angle = _get_val(CAMERA_ANGLES, selections.get('camera_angle', 'eye_level'),
                     selections.get('camera_angle_prompt', 'eye-level perspective'))
    mood_val = _get_val(MOODS, selections.get('mood', 'warm'),
                        selections.get('mood_prompt', 'warm and inviting'))
    return f"{light}. {angle}. {mood_val}."


def _quality(selections: dict) -> str:
    return _get_val(QUALITY_PREFIX, selections.get('render_quality', 'standard'), 'high quality render, detailed')


# ─── Surface: Carpet (موكيت / Wall-to-Wall Broadloom) ───────────────────────

def build_carpet_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'commercial wall-to-wall carpet')
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} where the ENTIRE floor is completely covered wall-to-wall with carpet — "
        f"NO wooden floor, NO tile floor, NO bare floor visible anywhere. The carpet covers 100% of the floor area. "
        f"IMPORTANT: The carpet must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in color, texture, fiber pattern, pile height, or pile density. "
        f"Do NOT stylize, recolor, smooth, enhance, or reinterpret the carpet in any way. "
        f"The carpet is a continuous seamless surface — no visible seams between tiles, no grout lines, no gaps, no borders. "
        f"Uniform pile direction throughout the entire floor. "
        f"This is broadloom wall-to-wall carpet installation, NOT an area rug on top of another floor. {lcm} "
        f"{q}, wide-angle architectural lens showing the full floor coverage. {UNIVERSAL_FOOTER}"
    )


# ─── Surface: Plank Flooring (Parquet / LVT / SPC / Vinyl) ─────────────────

def build_plank_floor_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'plank flooring')
    subtype = analysis.get('material_subtype', 'parquet')
    mat_name = 'parquet wood flooring' if subtype == 'parquet' else 'LVT/SPC vinyl plank flooring'
    accuracy_attrs = 'color, texture, wood grain pattern, and plank dimensions'
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} with {mat_name} installed across the entire floor. "
        f"IMPORTANT: The {mat_name} must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in {accuracy_attrs}. "
        f"Do NOT stylize, recolor, enhance, smooth, or reinterpret the {mat_name} in any way. "
        f"The planks must be installed in a straight plank layout with parallel alignment, "
        f"clean uniform joints, and professional installation quality. {lcm} "
        f"{q}, wide-angle architectural lens, detailed material texture visible. {UNIVERSAL_FOOTER}"
    )


# ─── Surface: Ceramic / Porcelain / Mosaic Tiles ─────────────────────────────

def build_tile_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'ceramic tile')
    placement = analysis.get('recommended_placement', 'floor')
    subtype = analysis.get('material_subtype', 'ceramic_tile')

    if subtype == 'mosaic':
        mat_name = 'mosaic tile'
        install_desc = 'mosaic tile installation with consistent joint width and professional grouting'
    elif subtype == 'porcelain_tile':
        mat_name = 'large-format porcelain tile'
        install_desc = 'porcelain tile installation with minimal thin grout lines and perfect alignment'
    else:
        mat_name = 'ceramic tile'
        install_desc = 'ceramic tile installation with uniform grout joints and perfect alignment'

    if placement == 'wall':
        surface_desc = 'covering the entire wall surface'
    elif placement == 'both':
        surface_desc = 'covering both the floor and walls'
    else:
        surface_desc = 'covering the entire floor surface'

    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} with {mat_name} {surface_desc}. "
        f"IMPORTANT: The tile must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in color, surface pattern, texture, gloss finish, or tile dimensions. "
        f"Do NOT stylize, recolor, enhance, or reinterpret the tile in any way. "
        f"The {install_desc}, tiles perfectly aligned. {lcm} "
        f"{q}, wide-angle architectural lens. {UNIVERSAL_FOOTER}"
    )


# ─── Surface: Marble / Natural Stone ─────────────────────────────────────────

def build_stone_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'marble slab')
    placement = analysis.get('recommended_placement', 'floor')
    subtype = analysis.get('material_subtype', 'marble')
    mat_name = 'marble' if subtype == 'marble' else 'natural stone'
    accuracy_attrs = (
        'veining pattern, color tones, polish level, and surface texture'
        if subtype == 'marble'
        else 'texture, color, grain pattern, and surface finish'
    )

    if placement == 'wall':
        surface_desc = 'wall cladding covering the full wall surface'
    elif placement == 'both':
        surface_desc = 'floor and wall cladding'
    else:
        surface_desc = 'flooring across the entire floor area'

    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} with {mat_name} {surface_desc}. "
        f"IMPORTANT: The {mat_name} must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in {accuracy_attrs}. "
        f"Do NOT stylize, recolor, enhance, or reinterpret the {mat_name} in any way. "
        f"The {mat_name} must be installed seamlessly with clean professional joints. "
        f"Natural material appearance with realistic surface reflections. {lcm} "
        f"{q}, wide-angle architectural lens. {UNIVERSAL_FOOTER}"
    )


# ─── Surface: Glass Block (بلوك زجاج) ────────────────────────────────────────

def build_glass_block_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'glass block')
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} featuring a glass block wall or partition. "
        f"IMPORTANT: The glass block must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in shape, size, surface texture, transparency, or refraction behavior. "
        f"Do NOT stylize, recolor, tint, enhance, exaggerate reflections, or reinterpret the glass blocks. "
        f"The glass blocks must be installed in a perfect grid pattern with clean uniform joints "
        f"in neutral light grey, professional architectural installation quality. "
        f"Realistic daylight diffused through the blocks without altering their true appearance. {lcm} "
        f"{q}. {UNIVERSAL_FOOTER}"
    )


# ─── Surface: Wall Covering (Wallpaper / Cladding Panels) ───────────────────

def build_wall_covering_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'wall covering')
    subtype = analysis.get('material_subtype', 'wall_cladding')
    mat_name = 'wallpaper' if subtype == 'wallpaper' else 'wall cladding panel'
    install_desc = (
        'applied seamlessly across the full wall surface with no visible seams or overlaps'
        if subtype == 'wallpaper'
        else 'installed on the full wall surface with clean professional joints'
    )
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} with {mat_name} covering the main wall. "
        f"IMPORTANT: The {mat_name} must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in color, pattern, texture, or surface finish. "
        f"Do NOT stylize, recolor, enhance, or reinterpret the {mat_name} in any way. "
        f"The {mat_name} must be {install_desc}. {lcm} "
        f"{q}, wide-angle architectural lens. {UNIVERSAL_FOOTER}"
    )


# ─── Surface: Pool Tiles ──────────────────────────────────────────────────────

def build_pool_tile_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'pool tile')
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a luxury pool area with pool tiles lining the interior of the pool. "
        f"IMPORTANT: The pool tile must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in color, surface pattern, texture, or finish. "
        f"Do NOT stylize, recolor, or enhance the tiles in any way. "
        f"Professional installation with clean uniform joints. Water reflections visible on tile surface. {lcm} "
        f"{q}. {UNIVERSAL_FOOTER}"
    )


# ─── Surface: Generic Fallback ────────────────────────────────────────────────

def build_generic_surface_prompt(analysis: dict, selections: dict) -> str:
    placement = analysis.get('recommended_placement', 'floor')
    placement_text = (
        'floor covering' if placement == 'floor'
        else 'wall covering' if placement == 'wall'
        else 'surface covering'
    )
    product_desc = analysis.get('description_en', 'building material product')
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} featuring {product_desc} as the main {placement_text}. "
        f"IMPORTANT: The material must remain IDENTICAL to the uploaded reference image with "
        f"ZERO variation in color, texture, pattern, or surface finish. "
        f"Do NOT stylize, recolor, or reinterpret the material in any way. {lcm} "
        f"{q}, wide-angle architectural lens, detailed material texture visible. {UNIVERSAL_FOOTER}"
    )


# ─── Surface Router ───────────────────────────────────────────────────────────

def build_surface_prompt(analysis: dict, selections: dict) -> str:
    subtype = analysis.get('material_subtype', '')
    if subtype == 'carpet':
        return build_carpet_prompt(analysis, selections)
    elif subtype in ('parquet', 'lvt_spc'):
        return build_plank_floor_prompt(analysis, selections)
    elif subtype == 'rubber_flooring':
        return build_rubber_floor_prompt(analysis, selections)
    elif subtype in ('ceramic_tile', 'porcelain_tile', 'mosaic'):
        return build_tile_prompt(analysis, selections)
    elif subtype in ('natural_stone', 'marble'):
        return build_stone_prompt(analysis, selections)
    elif subtype == 'glass_block':
        return build_glass_block_prompt(analysis, selections)
    elif subtype in ('wallpaper', 'wall_cladding'):
        return build_wall_covering_prompt(analysis, selections)
    elif subtype == 'pool_tile':
        return build_pool_tile_prompt(analysis, selections)
    else:
        return build_generic_surface_prompt(analysis, selections)


# ─── Product: Sanitary Ware ───────────────────────────────────────────────────

def build_sanitary_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'sanitary ware product')
    space_key = selections.get('space_type', 'bathroom')
    scene = _get_val(SPACE_TYPES, space_key, 'modern luxury bathroom')
    style = _get_val(DESIGN_STYLES, selections.get('design_style', 'modern'),
                     selections.get('design_style_prompt', 'modern minimalist design'))
    light = _get_val(LIGHTING_OPTIONS, selections.get('lighting', 'natural'),
                     selections.get('lighting_prompt', 'natural daylight'))
    angle = _get_val(CAMERA_ANGLES, selections.get('camera_angle', 'eye_level'),
                     selections.get('camera_angle_prompt', 'eye-level perspective'))
    mood_val = _get_val(MOODS, selections.get('mood', 'elegant'),
                        selections.get('mood_prompt', 'elegant refined atmosphere'))
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene}, {style}, with {product_desc} professionally installed as the focal centerpiece. "
        f"IMPORTANT: The product must maintain its IDENTICAL appearance from the reference image — "
        f"ZERO variation in shape, color, finish, or design. "
        f"Do NOT alter, stylize, or reinterpret the product. "
        f"The product is the main focal point, clearly visible and well-lit. "
        f"{light}. {angle}. {mood_val}. "
        f"{q}, professional interior photography. {UNIVERSAL_FOOTER}"
    )


# ─── Product: Outdoor Furniture / Artificial Grass ───────────────────────────

def build_outdoor_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'outdoor product')
    space_key = selections.get('space_type', 'outdoor')
    scene = _get_val(SPACE_TYPES, space_key, 'beautiful outdoor patio area')
    style = _get_val(DESIGN_STYLES, selections.get('design_style', 'modern'),
                     selections.get('design_style_prompt', 'modern minimalist design'))
    light = _get_val(LIGHTING_OPTIONS, selections.get('lighting', 'natural'),
                     selections.get('lighting_prompt', 'natural daylight'))
    angle = _get_val(CAMERA_ANGLES, selections.get('camera_angle', 'eye_level'),
                     selections.get('camera_angle_prompt', 'eye-level perspective'))
    mood_val = _get_val(MOODS, selections.get('mood', 'warm'),
                        selections.get('mood_prompt', 'warm and inviting'))
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene}, {style}, featuring {product_desc} as the main focal element. "
        f"IMPORTANT: The product must maintain its IDENTICAL appearance from the reference image — "
        f"ZERO variation in shape, color, texture, or design. "
        f"Do NOT alter, stylize, or reinterpret the product. "
        f"{light}. {angle}. {mood_val}. "
        f"{q}, professional outdoor photography. {UNIVERSAL_FOOTER}"
    )


# ─── Product: Decorative Area Rug ────────────────────────────────────────────

def build_rug_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'decorative area rug')
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} with a decorative area rug placed on top of the existing floor as an accent piece. "
        f"IMPORTANT: The rug must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in color, pattern, texture, pile height, or dimensions. "
        f"Do NOT stylize, recolor, or reinterpret the rug. "
        f"The rug is placed on the floor as a standalone accent piece (not wall-to-wall). {lcm} "
        f"{q}, wide-angle architectural lens. {UNIVERSAL_FOOTER}"
    )


# ─── Product: Indoor Furniture ───────────────────────────────────────────────

def build_indoor_furniture_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'indoor furniture piece')
    space_key = selections.get('space_type', 'living_room')
    scene = _get_val(SPACE_TYPES, space_key, 'spacious modern living room with large windows')
    style = _get_val(DESIGN_STYLES, selections.get('design_style', 'modern'),
                     selections.get('design_style_prompt', 'modern minimalist design'))
    light = _get_val(LIGHTING_OPTIONS, selections.get('lighting', 'natural'),
                     selections.get('lighting_prompt', 'natural daylight'))
    angle = _get_val(CAMERA_ANGLES, selections.get('camera_angle', 'eye_level'),
                     selections.get('camera_angle_prompt', 'eye-level perspective'))
    mood_val = _get_val(MOODS, selections.get('mood', 'warm'),
                        selections.get('mood_prompt', 'warm and inviting'))
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene}, {style}, featuring {product_desc} as the main furniture centerpiece. "
        f"IMPORTANT: The furniture must maintain its IDENTICAL appearance from the reference image — "
        f"ZERO variation in shape, color, material, upholstery, or design details. "
        f"Do NOT alter, stylize, recolor, or reinterpret the furniture in any way. "
        f"The furniture piece is the focal point of the scene, clearly visible and styled in context. "
        f"{light}. {angle}. {mood_val}. "
        f"{q}, professional interior photography. {UNIVERSAL_FOOTER}"
    )


# ─── Surface: Rubber Flooring (أرضيات مطاطية) ────────────────────────────────

def build_rubber_floor_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'rubber flooring')
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene} with rubber flooring installed seamlessly across the entire floor surface. "
        f"IMPORTANT: The rubber flooring must remain IDENTICAL to the uploaded reference image — {product_desc}. "
        f"ZERO variation in color, texture pattern (ribbed/smooth/coin/diamond), surface finish, or material appearance. "
        f"Do NOT stylize, recolor, smooth, enhance, or reinterpret the rubber flooring in any way. "
        f"The rubber flooring covers 100% of the floor area, wall-to-wall, with no other floor visible. "
        f"Professional installation quality, seamless coverage. {lcm} "
        f"{q}, wide-angle architectural lens showing full floor coverage. {UNIVERSAL_FOOTER}"
    )


# ─── Product: Generic Fallback ────────────────────────────────────────────────

def build_generic_product_prompt(analysis: dict, selections: dict) -> str:
    placement = analysis.get('recommended_placement', 'bathroom')
    scene_map = {
        'bathroom': 'modern luxury bathroom',
        'kitchen': 'contemporary open kitchen',
        'outdoor': 'elegant outdoor patio',
        'pool_area': 'luxury pool area',
        'entrance': 'grand entrance lobby',
    }
    scene = scene_map.get(placement, 'modern interior space')
    space_key = selections.get('space_type', '')
    if space_key and space_key in SPACE_TYPES:
        scene = SPACE_TYPES[space_key]

    product_desc = analysis.get('description_en', 'building material product')
    style = _get_val(DESIGN_STYLES, selections.get('design_style', 'modern'),
                     selections.get('design_style_prompt', 'modern minimalist design'))
    light = _get_val(LIGHTING_OPTIONS, selections.get('lighting', 'natural'),
                     selections.get('lighting_prompt', 'natural daylight'))
    angle = _get_val(CAMERA_ANGLES, selections.get('camera_angle', 'eye_level'),
                     selections.get('camera_angle_prompt', 'eye-level perspective'))
    mood_val = _get_val(MOODS, selections.get('mood', 'warm'),
                        selections.get('mood_prompt', 'warm and inviting'))
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Show a {scene}, {style}, with {product_desc} professionally installed as the focal centerpiece. "
        f"IMPORTANT: The product must maintain its IDENTICAL appearance from the reference image — "
        f"ZERO variation in shape, color, finish, or design. "
        f"The product is the main focal point, clearly visible and well-lit. "
        f"{light}. {angle}. {mood_val}. "
        f"{q}, professional interior photography. {UNIVERSAL_FOOTER}"
    )


# ─── Product Router ───────────────────────────────────────────────────────────

def build_product_prompt(analysis: dict, selections: dict) -> str:
    subtype = analysis.get('material_subtype', '')
    if subtype == 'sanitary':
        return build_sanitary_prompt(analysis, selections)
    elif subtype in ('outdoor_furniture', 'facade'):
        return build_outdoor_prompt(analysis, selections)
    elif subtype == 'decorative_rug':
        return build_rug_prompt(analysis, selections)
    elif subtype == 'indoor_furniture':
        return build_indoor_furniture_prompt(analysis, selections)
    else:
        return build_generic_product_prompt(analysis, selections)


# ─── Showcase ─────────────────────────────────────────────────────────────────

def build_showcase_prompt(analysis: dict, selections: dict) -> str:
    product_desc = analysis.get('description_en', 'building material product')
    light = _get_val(LIGHTING_OPTIONS, selections.get('lighting', 'studio'),
                     'professional studio lighting, perfectly balanced, commercial quality')
    q = _quality(selections)
    return (
        f"{UNIVERSAL_OPENER} "
        f"Professional product photography of {product_desc}. "
        f"The product is displayed on a clean neutral studio background (soft gradient white or light grey). "
        f"IMPORTANT: The product must remain IDENTICAL to the uploaded reference image with "
        f"ZERO variation in shape, color, texture, or packaging details. "
        f"Do NOT alter, stylize, or reinterpret the product. "
        f"Commercial advertising quality. {light}. "
        f"Product centered and clearly visible, sharp focus on all product details and packaging. "
        f"Clean minimal composition, no distracting elements, product is the sole focus. "
        f"{q}. {UNIVERSAL_FOOTER}"
    )


# ─── Image Enhancement (Clean Product Photo) ─────────────────────────────────

ENHANCE_BACKGROUNDS = {
    'pure_white': 'pure seamless white studio background (#FFFFFF), perfectly clean and uniform',
    'soft_white': 'soft white studio background with very subtle gradient from white to light grey at the bottom',
    'light_gray': 'light neutral grey studio background (#EEEEEE), perfectly clean and uniform',
    'cream': 'warm cream / off-white studio background (#F5F1E8), perfectly clean and uniform',
}

ENHANCE_LIGHTING = {
    'studio': 'professional studio softbox lighting, balanced from multiple sides, no harsh shadows, commercial product photography lighting',
    'soft': 'soft diffused lighting from above, gentle even illumination, minimal shadows',
    'dramatic': 'directional key lighting from one side with subtle fill light, defined but soft shadow on the opposite side',
    'top_down': 'soft top-down lighting, even illumination across the product, subtle shadow directly below',
}

ENHANCE_FRAMING = {
    'tight': 'product fills most of the frame with minimal padding around it, tight crop',
    'normal': 'product centered with comfortable padding around all sides, balanced composition',
    'loose': 'product centered with generous white space around it, airy minimal composition',
}

ENHANCE_SHADOW = {
    'natural': 'natural soft realistic contact shadow directly beneath the product, grounding it on the surface',
    'subtle': 'very subtle soft shadow beneath the product, almost imperceptible',
    'none': 'no visible shadow, product appears to float on the background',
}


def build_enhance_prompt(analysis: dict, selections: dict, custom_notes: str = '') -> str:
    product_desc = analysis.get('description_en', 'product')
    product_type = analysis.get('product_type_en', '') or analysis.get('product_type', '')
    color = analysis.get('color_en', '') or analysis.get('color', '')
    surface = analysis.get('surface_en', '') or analysis.get('surface', '')

    bg = _get_val(ENHANCE_BACKGROUNDS, selections.get('background', 'pure_white'),
                  ENHANCE_BACKGROUNDS['pure_white'])
    light = _get_val(ENHANCE_LIGHTING, selections.get('lighting', 'studio'),
                     ENHANCE_LIGHTING['studio'])
    framing = _get_val(ENHANCE_FRAMING, selections.get('framing', 'normal'),
                       ENHANCE_FRAMING['normal'])
    shadow = _get_val(ENHANCE_SHADOW, selections.get('shadow', 'natural'),
                      ENHANCE_SHADOW['natural'])
    q = _quality(selections)

    type_part = f" ({product_type})" if product_type else ''
    color_part = f", {color}" if color else ''
    surface_part = f", {surface} finish" if surface else ''

    prompt = (
        f"{UNIVERSAL_OPENER} "
        f"PROFESSIONAL PRODUCT PHOTOGRAPHY of the EXACT SAME product shown in the reference image — "
        f"{product_desc}{type_part}{color_part}{surface_part}. "
        f"This is a CATALOG / E-COMMERCE product shot, NOT an interior scene, NOT a lifestyle scene, NOT decorative. "
        f"\n\nGOAL: Take the reference product and present it as a clean, sharp, well-lit catalog photo. "
        f"FIX any quality issues from the source: enhance sharpness, fix exposure, remove motion blur, "
        f"correct white balance, recover detail in shadows and highlights, denoise, increase clarity. "
        f"Make any unclear textures, veining, patterns, or fine details CRISP and CLEARLY VISIBLE. "
        f"\n\nCRITICAL — PRODUCT IDENTITY: The product MUST remain 100% IDENTICAL to the reference image: "
        f"ZERO variation in shape, proportions, color, finish, design, pattern, texture, materials, "
        f"or any visual feature. Do NOT redesign, restyle, recolor, reinterpret, or substitute the product. "
        f"Do NOT add, remove, or modify any feature of the product. "
        f"This is a quality-enhancement / clean-shot operation, not a creative reimagining. "
        f"\n\nBACKGROUND: {bg}. "
        f"Remove the original background completely. "
        f"No floor texture, no wall texture, no room context, no other objects, no props. "
        f"\n\nCOMPOSITION: {framing}. Product centered horizontally, slight upper-third placement. "
        f"\n\nLIGHTING: {light}. {shadow}. "
        f"\n\nQUALITY: {q}, sharp focus throughout the product, "
        f"high resolution, commercial e-commerce photography quality. "
        f"\n\nNO text, NO logo, NO watermark, NO label overlays, NO room context, NO scene, NO additional objects. "
        f"{UNIVERSAL_FOOTER}"
    )

    if custom_notes and custom_notes.strip():
        prompt += f' Additional notes: {custom_notes.strip()}.'

    return prompt


ENHANCE_NEGATIVE_PROMPT = (
    "blurry, low quality, distorted, unrealistic proportions, "
    "interior scene, room, lifestyle scene, decorative scene, installation context, "
    "floor visible, wall visible, furniture, props, additional objects, multiple products, "
    "redesigned product, different product, modified product, recolored product, restyled product, "
    "different shape, different pattern, different texture, different finish, "
    "collage, grid layout, split screen, multiple angles in one image, "
    "comparison layout, side by side, before and after, dual view, "
    "text overlay, logo, watermark, brand name, label, "
    "noisy background, textured background, gradient extreme, dark background, colored background"
)


def build_prompt(
    product_description: str = '',
    placement: str = 'main feature',
    selections: dict | None = None,
    analysis: dict | None = None,
    custom_notes: str = '',
) -> str:
    if analysis is None:
        analysis = {}
    if selections is None:
        selections = {}

    if not analysis.get('description_en') and product_description:
        analysis['description_en'] = product_description

    mode = analysis.get('generation_mode', 'surface')

    if mode == 'product':
        prompt = build_product_prompt(analysis, selections)
    elif mode == 'showcase':
        prompt = build_showcase_prompt(analysis, selections)
    else:
        prompt = build_surface_prompt(analysis, selections)

    if custom_notes and custom_notes.strip():
        prompt = prompt + f', {custom_notes.strip()}'

    return prompt


ROLE_LABELS = {
    'floor': 'floor covering material',
    'wall': 'wall covering material',
    'focal': 'HERO product — the primary focus of this scene',
    'accent': 'supporting/accent element (secondary, complements the hero)',
}


def build_multi_product_prompt(slots: list[dict], selections: dict, custom_notes: str = '') -> str:
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)

    product_lines = []
    for i, slot in enumerate(slots, 1):
        role = slot.get('role', 'focal')
        analysis = slot.get('analysis', {})
        desc = analysis.get('description_en', 'building material product')
        product_type = analysis.get('product_type_en', '') or analysis.get('product_type', '')
        surface = analysis.get('surface_en', '') or analysis.get('surface', '')
        color = analysis.get('color_en', '') or analysis.get('color', '')
        placement = analysis.get('recommended_placement', '')
        role_label = ROLE_LABELS.get(role, 'design element')

        type_info = f" ({product_type})" if product_type else ''
        surface_info = f", {surface} finish" if surface else ''
        color_info = f", {color}" if color else ''
        placement_info = ''
        if placement and role in ('focal', 'accent'):
            placement_map = {
                'bathroom': 'installed in the bathroom',
                'kitchen': 'installed in the kitchen',
                'wall': 'mounted on the wall',
                'floor': 'placed on the floor',
            }
            placement_info = f", {placement_map.get(placement, f'for {placement} use')}"

        product_lines.append(
            f"Product {i} (Reference Image {i}) — role: {role_label}{type_info}{color_info}{surface_info}{placement_info}. "
            f"Description: {desc}. "
            f"This product must appear IDENTICAL to its reference image — "
            f"ZERO variation in color, texture, pattern, or surface finish."
        )

    floor_slots = [s for s in slots if s.get('role') == 'floor']
    wall_slots = [s for s in slots if s.get('role') == 'wall']

    placement_instructions = []
    if floor_slots:
        floor_analysis = floor_slots[0].get('analysis', {})
        floor_type = floor_analysis.get('product_type_en', '') or floor_analysis.get('product_type', '') or 'material'
        placement_instructions.append(
            f"The floor {floor_type} covers the ENTIRE floor surface wall-to-wall "
            f"with professional installation, no bare floor visible."
        )
    if wall_slots:
        wall_analysis = wall_slots[0].get('analysis', {})
        wall_type = wall_analysis.get('product_type_en', '') or wall_analysis.get('product_type', '') or 'material'
        placement_instructions.append(
            f"The wall {wall_type} covers the main visible walls "
            f"with professional installation and proper alignment."
        )
    hero_slots = [s for s in slots if s.get('role') == 'focal']
    accent_slots = [s for s in slots if s.get('role') == 'accent']

    if hero_slots:
        hero = hero_slots[0]
        ha = hero.get('analysis', {})
        hero_desc = ha.get('description_en', 'product')
        hp = ha.get('recommended_placement', '')
        hp_hint = f" (for {hp} use)" if hp and hp not in ('floor', 'wall') else ''
        placement_instructions.append(
            f"HERO FOCUS: The {hero_desc}{hp_hint} is the STAR of this scene — "
            f"it must be the most prominent, centrally placed, and visually dominant element. "
            f"Compose the shot so the viewer's eye is drawn to this product FIRST. "
            f"It should occupy the most visually important area and receive the best lighting."
        )

    if accent_slots:
        accent_parts = []
        for s in accent_slots:
            fa = s.get('analysis', {})
            fd = fa.get('description_en', 'product')
            accent_parts.append(fd)
        placement_instructions.append(
            f"The supporting product(s) ({', '.join(accent_parts)}) complement the scene "
            f"but are secondary — they should be visible but NOT compete for attention with the hero product."
        )

    products_block = '\n'.join(product_lines)
    placement_block = ' '.join(placement_instructions)

    prompt = (
        f"{UNIVERSAL_OPENER} "
        f"Create a cohesive interior design scene in a {scene}. "
        f"This scene combines MULTIPLE products from the reference images into ONE unified space:\n\n"
        f"{products_block}\n\n"
        f"PLACEMENT: {placement_block}\n\n"
        f"CRITICAL: Each product must match its reference image EXACTLY. "
        f"The hero/focal product must be the DOMINANT visual element — largest, most prominent, best-lit. "
        f"Supporting products complement but never overshadow the hero. "
        f"All products must coexist naturally in the same scene with consistent perspective, "
        f"lighting, and scale. The scene should look like a professional interior design photograph "
        f"where the hero product is clearly the star and all materials complement each other. "
        f"{lcm} {q}. {UNIVERSAL_FOOTER}"
    )

    if custom_notes and custom_notes.strip():
        prompt += f', {custom_notes.strip()}'

    return prompt


# ─── Dual Same-Category Mode ─────────────────────────────────────────────────
# Two products of the SAME category mixed into a single surface (floor/wall)
# using one of four mixing patterns: checkerboard, half_split, stripes,
# border_center.

DUAL_PATTERN_INSTRUCTIONS = {
    'checkerboard': (
        "CHECKERBOARD PATTERN — alternate the two materials in a precise "
        "checkerboard layout: square tiles/units of equal size arranged so that "
        "every adjacent unit on all four sides is the OTHER material. "
        "Material A occupies the dark squares of a chessboard; Material B "
        "occupies the light squares. Joints between units are uniform, "
        "perfectly aligned both horizontally and vertically, professional "
        "installation. The two materials must alternate across the ENTIRE "
        "surface area edge-to-edge — never two of the same material adjacent."
    ),
    'half_split': (
        "HALF AND HALF SPLIT — the surface is divided into TWO equal halves. "
        "Material A covers exactly one half of the surface; Material B covers "
        "the other half. The dividing line is a clean straight transition "
        "(perpendicular to the camera, dividing left-half from right-half "
        "for floors, or top-half from bottom-half for walls). The boundary "
        "is a crisp professional joint with no overlap and no blending — "
        "the two halves remain visually distinct yet meet seamlessly."
    ),
    'stripes': (
        "ALTERNATING STRIPES — the surface is covered with parallel linear "
        "bands/stripes of equal width that alternate between Material A and "
        "Material B in a strict A-B-A-B-A-B sequence across the ENTIRE "
        "surface. Stripes run from one edge to the opposite edge in a "
        "single direction (parallel to the longer wall for floors, "
        "horizontal for walls). Each stripe is the same width; transitions "
        "between stripes are clean straight joints; no curves, no diagonals."
    ),
    'border_center': (
        "BORDER AND CENTER INSET — Material A forms a continuous outer "
        "BORDER/FRAME around the perimeter of the surface (uniform width on "
        "all four sides, like a picture frame). Material B fills the entire "
        "INTERIOR/CENTER area inside that border as one unified inset zone. "
        "The transition between border and center is a clean rectangular "
        "joint, perfectly straight on all four sides, professional mitred "
        "or butt joints at corners. Material A surrounds; Material B is "
        "the central feature."
    ),
}

DUAL_SURFACE_PHRASE = {
    'floor': 'covers the ENTIRE floor surface wall-to-wall',
    'wall': 'covers the main visible wall surface from edge to edge',
}


def build_dual_same_category_prompt(
    slots: list[dict],
    pattern: str,
    surface: str,
    selections: dict,
    custom_notes: str = '',
) -> str:
    """Build a generation prompt for two products of the same category
    combined into one surface using a specific mixing pattern."""
    scene = _scene_desc(selections)
    lcm = _light_camera_mood(selections)
    q = _quality(selections)

    pattern_desc = DUAL_PATTERN_INSTRUCTIONS.get(
        pattern, DUAL_PATTERN_INSTRUCTIONS['checkerboard']
    )
    surface_phrase = DUAL_SURFACE_PHRASE.get(surface, DUAL_SURFACE_PHRASE['floor'])

    # Describe the two materials (A = first slot, B = second slot)
    material_lines = []
    labels = ['A', 'B']
    for i, slot in enumerate(slots[:2]):
        analysis = slot.get('analysis', {})
        desc = analysis.get('description_en', 'building material product')
        product_type = analysis.get('product_type_en', '') or analysis.get('product_type', '')
        surface_finish = analysis.get('surface_en', '') or analysis.get('surface', '')
        color = analysis.get('color_en', '') or analysis.get('color', '')

        type_info = f" ({product_type})" if product_type else ''
        surface_info = f", {surface_finish} finish" if surface_finish else ''
        color_info = f", {color}" if color else ''

        material_lines.append(
            f"Material {labels[i]} (Reference Image {i + 1}){type_info}{color_info}{surface_info}. "
            f"Description: {desc}. "
            f"Material {labels[i]} must appear IDENTICAL to its reference image — "
            f"ZERO variation in color, texture, pattern, or surface finish. "
            f"Do NOT recolor, restyle, blend, or reinterpret it."
        )

    materials_block = '\n'.join(material_lines)
    other_surface = 'wall' if surface == 'floor' else 'floor'

    prompt = (
        f"{UNIVERSAL_OPENER} "
        f"Create a cohesive interior design scene in a {scene}. "
        f"This scene combines TWO different materials of the SAME category "
        f"into ONE single {surface} surface using a specific mixing pattern:\n\n"
        f"{materials_block}\n\n"
        f"COMBINED SURFACE: A single mixed {surface} {surface_phrase}, made of "
        f"BOTH Material A and Material B together. The {other_surface}s and the "
        f"rest of the room must be neutral/blank so the mixed {surface} is the "
        f"clear focus.\n\n"
        f"MIXING PATTERN: {pattern_desc}\n\n"
        f"CRITICAL RULES: Both materials must coexist on the same {surface} with "
        f"perfectly aligned joints, consistent scale, and professional "
        f"installation quality. Material A must look exactly like its reference "
        f"image; Material B must look exactly like its reference image; do NOT "
        f"average, blend, recolor, or merge their appearances. The pattern must "
        f"be clearly readable across the entire {surface}. "
        f"{lcm} {q}, wide-angle architectural lens showing the full {surface} "
        f"coverage and the mixing pattern clearly. {UNIVERSAL_FOOTER}"
    )

    if custom_notes and custom_notes.strip():
        prompt += f' Additional notes: {custom_notes.strip()}.'

    return prompt
