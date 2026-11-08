# 错层 Wrong Floor · 建模提示词

给 Blender 文本生成插件用。每段英文提示词整段复制。导出统一为 **glTF 2.0 Binary（`.glb`）**，不要开 Draco、Meshopt、KTX2。单位 1 = 1 米，Y 轴朝上。

同学和木偶进游戏后还要在 Blender 里按髋、肩拆开左右腿和左右上臂，旋转中心放在关节上。游戏靠转这四个物体走路，不读骨骼动画。

第五关的血肉墙仍由程序生成，不用建模。眼睛、黑脸、牙、裂缝边饰必须分成四个文件，代码里它们会分开动。

## 共用负面提示词

同学、木偶：

```text
photorealistic, anime, bright studio lighting, white background pedestal, text, watermark, logo, extra fingers, extra limbs, gore, blood spray, weapon
```

第五关：

```text
photorealistic, medical photo, anime, blue, cyan, green, white teeth, classroom, desk, clock, door, glass, text, logo, bright studio light, white background
```

## 同学

序章和尾声用。身高约 1.75 米，脚底贴地。脸藏在暗处，但要能看出是学生。

```text
stylized low-poly game asset, dark Chinese high school at night, matte materials, muted colors, no text, no logo, no base, no background, Y-up, real-world meters. One slim student, full body, standing A-pose, feet on the ground, arms a little away from the torso. Height 1.75 meters. Short black hair, face mostly in shadow, skin dark warm gray-brown. Worn dark navy jacket, pale gray inner collar, dark charcoal trousers, plain black shoes. Small brown canvas backpack with one front pocket and two shoulder straps. No patterns, no badges. Single mesh, under 8000 triangles.
```

## 同学 · 面部细化

只换头。身体、藏青外套、浅领、书包、短发大轮廓保持 `classmate_v01` 不变。肤色继续用暖黄 `#cba57f`，眼白偏灰 `#7a7166`，瞳孔 `#2b2018`，眉和头发 `#17130f`。头控制在 2500 三角以内。

负面提示词：

```text
photorealistic pores, anime eyes, eyelashes, catchlight, blush, freckles, smile, teeth, beard, glasses, earrings, makeup, wrinkles, scars
```

```text
Refine only the head of this existing low-poly student. Keep the same short black hair silhouette, warm yellow skin #cba57f, navy jacket and pale collar. Stylized game mesh, matte, no pores.

Replace the egg-shaped head with a slim young face: narrow jaw, small chin, low cheekbones, a shallow brow ridge so the eyes sit inside the skull. Temples slightly hollow. Jaw meets a slim neck.

Eyes are tired almonds, not round stickers. Heavier upper lid, inner corner a little lower, thin shadow under the brow. Iris #2b2018 fills about half the visible eye. Sclera is gray-beige #7a7166, not pure white. No eyelashes, no sparkle.

Eyebrows are short, thicker at the inner end, tapering outward, resting on the brow ridge. Inner ends sit slightly higher.

Nose is a low bridge starting between the brows, soft tip, two shallow dark nostril cuts. Nose width close to the mouth.

Mouth is closed. A shallow groove, thin upper lip, slightly fuller lower lip, corners tucked into the cheeks. Lip color just darker than the skin, #231a15. No teeth.

Small ears visible from the side, upper half covered by hair. Sideburns stop just above the ear. Bangs keep the straight fringe but break the hairline a few millimeters so it is not one perfect horizontal cut.

Soft matte shadow only under the brow, under the nose, and under the lower lip. Head under 2500 triangles.
```

## 木偶

第 4 关红色人偶。轮廓与同学同一套，更瘦，没有书包。脸只有两个黑点和一条笑弧。腿要能从髋部单独转动。

```text
stylized low-poly game asset, dark Chinese high school at night, matte materials, muted colors, no text, no logo, no base, no background, Y-up, real-world meters. One thin human puppet, full body, standing A-pose, feet on the ground, arms slightly off the body. Height 1.75 meters, narrower than a real student. Whole body dried dark crimson and near-black maroon, stained matte cloth, no backpack. Blank face with only two flat black dot eyes and one thin upward curved black smile, a few short ink drips under the eyes and the mouth corners. No nose, no teeth, no wounds. Single mesh, under 8000 triangles.
```

## 木偶 · 面部细化（第四款）

只换头。身体仍是浅色美术木人 `#c9ac80`，关节球 `#a1815a`，没有头发、没有书包。头保持长椭圆，并向画完的那一侧微倾，让近看时完整的半张脸朝向玩家。头控制在 2000 三角以内。

左半张脸用同学的五官，但是画在木头上的平涂，不是皮肤。右半张从鼻梁中线刮回裸木。

负面提示词：

```text
photorealistic skin, anime eyes, eyelashes, teeth, blood, wound, gore, stitches, button eyes, glowing eyes, smile, hair, ears, second complete eye, makeup
```

```text
Refine only the head of this existing low-poly wooden puppet. Keep the long oval wood head, light wood #c9ac80, no hair, no ears, no backpack. Tilt the head slightly toward its painted side. Stylized game mesh, matte, under 2000 triangles.

Split the face down the bridge of the nose. The puppet's own left half is a flat painted copy of a classmate's face. The puppet's own right half is scraped back to bare wood.

Painted left half, chalky paint rather than skin: one tired almond eye, heavier upper lid, inner corner a little lower, iris #2b2018 filling about half the eye, gray-beige sclera #7a7166. One short eyebrow, thicker at the inner end, tapering outward, color #17130f. Half a low nose that stops at the midline, one shallow nostril. A closed mouth that starts at the left corner and ends abruptly at the midline, thin upper lip, slightly fuller lower lip, color #231a15. Paint color #cba57f, a little uneven, with wood grain showing through near the nose.

Scraped right half: bare wood #c9ac80. The right eye is only a broken half-arc of the same paint, cut off by the scrape. The mouth does not continue. The scrape edge is a pale ragged line of wood dust #e4d2b0, with a few shallow grain grooves #7d6041. No cut flesh, no blood, no teeth.
```

## 同学与木偶 · 拆出关节

不重做外形。把现在已经合并的腿和手臂拆成父子网格，子物体的原点放在关节上，局部 −Y 朝下。站立角度保持现状，旋转为零就是现在这副姿势。肩和髋的单轴不要超过 ±0.8 弧度，否则关节球会转出坑。

导出的 glb 必须保留父子关系。根节点 extras 写上这些名字：`legs`、`shins`、`feet`、`arms`、`forearms`、`hands`、`body`、`head`。左右顺序都是先左后右。

负面提示词：

```text
single merged mesh, skinning, armature, Mixamo, T-pose, A-pose change, moved feet, disconnected joints, extra limbs
```

### 同学

髋在 0.895 米，肩在 1.400 米，手臂已经外张 13°。膝和肘没有球，沿现有网格切开。

```text
Do not remodel this low-poly student. Keep the same clothes, face, hair, backpack, height 1.75 meters, feet on the ground. Split the existing limb meshes into parented pieces. Each child origin sits on its joint, local -Y points down the limb. Rest rotation is zero at the current pose. Keep the glTF parent hierarchy.

Classmate_Leg_L and Classmate_Leg_R stay at the hips, y=0.895, x=±0.090. Each holds only the thigh, from the hip down to the knee.
Classmate_Shin_L and Classmate_Shin_R are children of those legs. Origin 0.45 meters down the thigh. Each holds the shin from knee to ankle.
Classmate_Foot_L and Classmate_Foot_R are children of those shins. Origin 0.35 meters further down. Each holds the shoe.

Classmate_Arm_L and Classmate_Arm_R stay at the shoulders, y=1.400, x=±0.190, already tilted 13 degrees out. Each holds only the upper arm.
Classmate_Forearm_L and Classmate_Forearm_R are children of those arms. Origin 0.30 meters down the sleeve. Each holds the forearm.
Classmate_Hand_L and Classmate_Hand_R are children of those forearms. Origin 0.25 meters further down. Each holds the palm and fingers.

Classmate_Head is a child of Classmate_Body. Origin at the neck, y=1.535. It holds the head and hair. The body keeps the neck, torso, jacket and backpack, origin at the feet.
```

### 木偶

髋在 0.930 米，膝在 0.505 米，肩在 1.395 米，颈球在 1.470 米。球留在子物体上：膝球跟小腿，踝球跟鞋，肘球跟前臂，腕球跟手。

```text
Do not remodel this wooden ball-joint puppet. Keep the light wood, joint balls, long oval head, painted half-face, height 1.75 meters, feet on the ground, arms tilted 12 degrees out, feet turned out 9 degrees. Split the existing limb meshes into parented pieces. Each child origin sits on its joint ball, local -Y points down the limb. Rest rotation is zero at the current pose. Keep the glTF parent hierarchy.

PuppetV3_Leg_L and PuppetV3_Leg_R stay at the hips, y=0.930. Each holds the hip ball and the thigh only.
PuppetV3_Shin_L and PuppetV3_Shin_R are children of those legs, origin 0.425 meters down. Each holds the knee ball and the shin.
PuppetV3_Foot_L and PuppetV3_Foot_R are children of those shins, origin 0.420 meters further down. Each holds the ankle ball and the shoe.

PuppetV3_Arm_L and PuppetV3_Arm_R stay at the shoulders, y=1.395. Each holds the shoulder ball and the upper arm.
PuppetV3_Forearm_L and PuppetV3_Forearm_R are children of those arms, origin 0.300 meters down. Each holds the elbow ball and the forearm.
PuppetV3_Hand_L and PuppetV3_Hand_R are children of those forearms, origin 0.300 meters further down. Each holds the wrist ball, palm and fingers.

PuppetV3_Head is a child of PuppetV3_Body. Origin at the neck ball, y=1.470. It holds the head. The body keeps the chest, waist ball and pelvis, origin at the feet.
```

## 第五关 · 眼睛

前墙裂缝里的拍照目标。球心高度 2.42 米，两眼中心相距 0.38 米，每只直径 0.174 米。只要两颗球。

```text
stylized low-poly game asset, no background, Y-up, real-world meters. Only two glowing red eyeballs floating in empty space. No eyelids, no pupils, no face, no body. Each sphere is 0.174 meters in diameter, centers 0.38 meters apart, flat emissive red #ff2030. Two separate meshes, very low poly.
```

## 第五关 · 黑色巨脸

嵌在裂缝开口后面，几乎全黑。不要眼睛，不要牙齿。宽约 1.15 米，高约 1.7 米，厚度不超过 4 厘米。放进场景时不要凸出裂缝开口。

```text
stylized low-poly game asset, no background, Y-up, real-world meters. One huge flattened human face, about 1.15 meters wide and 1.7 meters tall, only 4 centimeters thick, standing upright. Near-black charcoal, slightly lighter on the brow ridge, nose bridge, cheekbones and jaw so the structure is barely readable. No eyes, no eye sockets, no teeth, no ears, no hair. Matte, no shine. Single mesh, under 4000 triangles.
```

## 第五关 · 咧嘴的牙

横在眼睛下方。上排 9 颗朝下，下排 8 颗朝上，交错咬合，嘴角上扬。污褐色，不是白牙。整排宽约 0.9 米。

```text
stylized low-poly game asset, no background, Y-up, real-world meters. One wide grin of dirty teeth floating alone, about 0.9 meters wide. Nine upper teeth pointing down, eight lower teeth pointing up, staggered, corners lifted higher than the center. Teeth are stained dark brown-red #4a2a20, not white, short and blunt. No lips, no gums, no face, no eyes. Single mesh, under 3000 triangles.
```

## 第五关 · 裂缝周围的装饰

裂缝翻边，加上从边上长出的触手和肉芽。中间必须是空的。竖缝从地面到约 3.1 米，最宽处开口约 0.9 米；到顶后沿天花板向房间内再伸约 2.6 米，末端收成尖。触手长 0.2 到 0.6 米，粗 3 到 8 厘米，根暗尖亮。颜色只留暗红到近黑。

```text
stylized low-poly game asset, dark horror, matte, no background, Y-up, real-world meters. An L-shaped torn flesh wound frame with a hollow center, nothing inside the hole. Vertical slit from the floor up to 3.1 meters, opening about 0.9 meters wide at the middle, ragged edges. At the ceiling it turns and runs 2.6 meters forward, tapering to a point. Three nested rims: outer dark blood red, middle deeper red, inner almost black. Short fleshy tentacles, 0.2 to 0.6 meters long and 3 to 8 centimeters thick, grow outward from the rim, darker at the root and brighter red at the tip. Small flesh buds along the lip. No face, no eyes, no teeth, no room, no furniture. Colors stay in dark red and black only. One mesh, under 8000 triangles.
```

脸和牙放在裂缝开口后面，眼睛放在牙的上方。
